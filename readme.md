# 👅 LLM Expand for VS Code

This is a simple text completion extension using an LLM of your choosing. 

While there's no shortage of sophisticated AI-powered completion tools, most of them are for coding. This one works best for creative writing. It does the simplest thing: takes the last N characters before cursor and asks an LLM (using `/api/generate` endpoint) for the most probable continuations. 

## Features

* Any OpenAI API provider, local or cloud
* Tries its best to generate complete words, not single tokens.

* **Above over below**: Searches backwards (above the cursor) and forwards (below). The matches above the cursor are always prioritized over those below.
* **Proximity sorted**: Suggestions are sorted based on their distance from the cursor, so the stuff you typed recently is at the top of the list. 
* **Bigrams**: Hippie Expand looks at the word *before* your current word and suggests words you previously typed *after* that word (bigrams). After the bigram suggestions, it also lists the regular (unigram) completions of the currently typed word without taking the previous word into account. 
* **Fast cache**: Uses a chunked, non-blocking background indexer that handles large files without freezing the UI. It maintains a limited-size cache of the area surrounding your cursor (200k characters by default), ensuring performance is consistent regardless of file size.

## How to Use

By default, Hippie Expand is activated for `textonly` and `markdown` documents (see Settings below for how to change that). 

Start typing. The standard VS Code completion list pops up. If you pressed space after a word, it only gives you bigram matches; otherwise, it lists bigram matches, if any, first and then unigram matches based on the partially typed word.

Hippie suggestions in the list have a 📄 (File) icon and are labeled with `(Hippie)`. Use arrows to choose, or press Tab to accept the top suggestion. Right after Tab, you can press Tab again to cycle through the suggestions in-place (Shift-Tab to cycle backwards).

For example, to copy a sentence from somewhere in your document, just start typing the first word, then go Tab - space - Tab - space... Sometimes, you may need several Tabs instead of one if it loses track of what you're trying to copy. 

Words, for Hippie Expand, consist of any Unicode letters, digits, hypen, or apostrophe. The pop-up is triggered by typing any of these, or a space.

## Settings 

* **Languages**: list of languages for which this extension is active. Default: "markdown", "plaintext".
* **Max Completions**: Show at most this many completions. Default: 10.
* **Window Size**: How many characters around cursor to scan (if the document is smaller, it is scanned entirely). Default: 200,000.

## Why not "Word-Based Suggestions"?

VS Code's built-in `editor.wordBasedSuggestions` is a global bucket of words (it doesn't care if a word is 5 lines away or 5,000) and doesn't support bigrams. Hippie Expand treats your text like a stream of thought: it assumes that what you're looking at right now is the most relevant source for what you are about to type. You don't need to turn off word-based suggestions for Hippie Expand to work. 

## Limitations

* **Single-File Scope**: Currently, this extension only indexes the active document. It does not look at other open tabs or workspace files.
* **Window Size**: By default, it indexes a 200,000-character window around the cursor. Large files (>50MB) are supported, but only the local context is searched for completions.
* **Case**: Hippie Expand uses case-insensitive match but copies the capitalization of the word; no attempt is made to recapitalize the word to its new context.

## Why "Hippie"?

This extension recreates (some of) the classic Emacs command `M-/`. Hippies don't fuss and go with the flow; so does Hippie Expand.

