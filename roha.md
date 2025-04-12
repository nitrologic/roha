# roha Commands

## /model

Select an AI model.
User can choose a model by name or index to change the AI
behavior.

## /share

Share a file or folder. User can provide a tag to
categorize the shared item.

## /dump

Refresh shared files. This command checks
for any updates or modifications and resends the share if
needed.

## /reset

Clear all shared files and conversation history. Use this to
start freshly when needed.

## /load

Load a saved conversation history snapshot.
User can specify a save index or file name to restore previous
chats.

## /save

Save the current conversation history. Creates a snapshot file of the conversation.

## /config

Toggle configuration flags (like ANSI rendering or auto-dump on start). Adjust settings to suit current preferences.

## /time

Display the current system time. Helps User verify system status.

## /history

List a summary of recent conversation entries. Provides a quick overview of chat history.

## /cd

Change the working directory. User can navigate to a desired directory for file operations.

## /dir

List the contents of the current working directory. Helps user view available files and folders to share.


## roha roadmap

### models account agnostic

Make models account agnostic add accountId and start a party

### autosave on exit autoload on start

Automatically save session state when exiting the application.

### tag command features

Add advanced filtering and management capabilities for tagged shares.

### retire use of deno prompt

Replace the basic Deno prompt with a more robust stdin handler.

### auto dump on file

Automagically update shared files when modifications are detected.

### fix black text on dark background in light mode terminals

Ensure proper ANSI color contrast for all terminal themes.

### sharedFiles [] => {} to avoid duplicants

Convert shared files storage to an object structure to prevent duplicates.

### remove shares if file not found on stat

Clean up shares when associated files are missing or moved.

### command auto complete

Implement tab-based auto-completion for commands and paths.
