import * as vscode from 'vscode';

/* ================= CONFIG ================= */

/* ================= TYPES ================= */

/* ================= ACTIVATE ================= */

export function activate(ctx: vscode.ExtensionContext) {
    let providerRegistration: vscode.Disposable | undefined;
    let currentSelector: vscode.DocumentSelector = [];

    const registerProvider = () => {
        const config = vscode.workspace.getConfiguration('LLMExpand');
        const languages = config.get<string[]>('languages') || ['*'];
        
        // deduplicate language list to prevent double-suggestions
        const uniqueLanguages = [...new Set(languages)];
        currentSelector = uniqueLanguages.map(lang => ({ language: lang }));

        if (providerRegistration) {
            providerRegistration.dispose();
        }

        providerRegistration = vscode.languages.registerCompletionItemProvider(
            currentSelector,
            { provideCompletionItems },
            ' ', '-', '\'', ...'0123456789',
            ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
            ...'абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ' 
        );
    };

    const trigger = (editor?: vscode.TextEditor, shouldFlash: boolean = false) => {
        if (!editor || !editor.document) return;
        const doc = editor.document;

        if (vscode.languages.match(currentSelector, doc) === 0) return;

        if (shouldFlash) {
            vscode.window.setStatusBarMessage('👅 LLM Expand Active', 3000);
        }
    };

    registerProvider();
    if (vscode.window.activeTextEditor) {
        trigger(vscode.window.activeTextEditor, true);
    }

    ctx.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('LLMExpand.languages')) {
                registerProvider();
            }
        }),

        vscode.window.onDidChangeActiveTextEditor(e => trigger(e, true)),

        // use document change listener: rescan if move to area AND start typing
        vscode.workspace.onDidChangeTextDocument(e => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document === e.document) {
                trigger(editor, false);
            }
        }),
        
        { dispose: () => providerRegistration?.dispose() }
    );
}

/* ================= PROVIDER ================= */

async function provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.CompletionList> {

    const config = vscode.workspace.getConfiguration('LLMExpand');
    const maxCompletions = config.get<number>('maxCompletions') || 10; 
    const contextSize = config.get<number>('contextSize') || 1000; 
    const baseURL = config.get<string>('baseURL') || "http://localhost:11434"; 
    const apiKey = config.get<string>('apiKey'); 
    const model = config.get<string>('model') || "qwen3-base-4b"; 
    const depth = config.get<number>('depth') || 2; 

    const abortController = new AbortController();

    // If VS Code tells us to cancel, abort the fetch
    token.onCancellationRequested(() => {
        abortController.abort();
    });

    const cursorOffset = document.offsetAt(position);

    const contextRange = new vscode.Range(
        document.positionAt(Math.max(0, cursorOffset - contextSize)), 
        position
    );
    const textBefore = document.getText(contextRange);

    const isSpace = textBefore.length > 0 && textBefore[textBefore.length - 1] === ' ';
    const context = isSpace? textBefore.slice(0, -1) : textBefore;

    const suggestions = await getLLMSuggestions(baseURL, model, context, maxCompletions, depth, apiKey);
    
    // need to dedupe
    const seen = new Set<string>();
    const items: vscode.CompletionItem[] = []; // build the return list

    //console.log(suggestions)

    for (const word of suggestions) {
        
        if (isSpace) { // if context ends with space (which we stripped), allow only completions that start with non-letter
            if (/^\p{L}/u.test(word))
                continue;
        }
        if (word.trim().length == 0) // but skip if it's space and nothing else
            continue;

        if (word.includes("<|endoftext|>") || word.includes("<|im_end|>"))
            continue

        var word_clean = word.trim();
        if (/^\s/.test(word) || isSpace)
            word_clean = ' '+word_clean;

        //console.log(`word_clean |${word_clean}|`)

        if (!seen.has(word_clean)) {
            seen.add(word_clean);

            // use 'FILE' for a custom icon
            const item = new vscode.CompletionItem(word_clean, vscode.CompletionItemKind.File);
            item.detail = "(LLM)";
            item.sortText = items.length.toString().padStart(5, '0');

            item.range = new vscode.Range(isSpace? document.positionAt(document.offsetAt(position) - 1) : position, position); // Force insertion at cursor

            // FIX 2: Set filterText to the current word + the suggestion 
            // to bypass the strict prefix filtering.
            const wordRange = document.getWordRangeAtPosition(position);
            const currentPrefix = wordRange ? document.getText(wordRange) : "";
            item.filterText = currentPrefix + word;            
      
            //console.log(`filtertext |${item.filterText}|`)

            item.command = {
                command: 'editor.action.triggerSuggest',
                title: 'Re-trigger completions'
            };
            
            items.push(item);
        }
        if (items.length >= maxCompletions) break;
    }

    // if items are empty, return null to let other providers take over
    if (items.length === 0) {
        return new vscode.CompletionList([]); // Return empty list on failure
    }

    //console.log(items);
    
    return new vscode.CompletionList(items, true); // mark as complete
}

/* ================= SEARCH ================= */

async function getLLMSuggestions(baseURL: string, model: string, textBefore: string, maxCompletions: number, depth: number, apiKey?: string, signal?: AbortSignal): Promise<string[]> {
    try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        // 1. Initial call: Get the top 'maxCompletions' next tokens (branches)
        const body = JSON.stringify({ 
            model, 
            prompt: textBefore, 
            stream: false, 
            raw: true, 
            logprobs: true, 
            top_logprobs: maxCompletions, 
            options: { num_predict: 1 } 
        });

        const res = await fetch(`${baseURL}/api/generate`, { body, headers, signal, method: 'POST' });
        if (!res.ok) throw new Error(`Initial request failed: ${res.status}`);
        
        const data = await res.json();
        if (!data.logprobs || data.logprobs.length === 0) return [];

        const initialTokens = data.logprobs[0].top_logprobs.map((item: { token: string }) => item.token);

        if (depth <= 0) return initialTokens;

        // 2. Optimization: For each branch, get the rest of the word in ONE call
        // We use Promise.all to run these requests in parallel
        const expandedTokens = await Promise.all(initialTokens.map(async (token: string) => {
            try {
                const expansionBody = JSON.stringify({
                    model,
                    prompt: textBefore + token,
                    stream: false,
                    raw: true,
                    options: { 
                        num_predict: depth, 
                        // Stop generating as soon as a word ends or a new line starts
                        stop: [" ", "\n", "\t", "\r"] 
                    },
                });

                const expansionRes = await fetch(`${baseURL}/api/generate`, { 
                    body: expansionBody, 
                    headers, 
                    signal, 
                    method: 'POST' 
                });

                if (!expansionRes.ok) return token;
                const expansionData = await expansionRes.json();
                
                // expansionData.response contains the joined tokens until a stop character is hit
                return token + (expansionData.response || "");
            } catch (e) {
                return token; // Fallback to the single token if expansion fails
            }
        }));

        return expandedTokens;
    } catch (err) {
        console.error("LLM Expand error: ", err);
        vscode.window.setStatusBarMessage(`👅 LLM Expand error: ${err}`, 20000);
        return [];
    }
}