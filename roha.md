# latest

the roa command line project has released the foundry research tool

![foundry reasearch](https://foundry.skid.nz)

![roha session](media/roha4.png)

## original roha project

a command line client to share folders and chat

requires XAI_API_KEY DEEPSEEK_API_KEY or OPENAI_API_KEY environment variable to run

### interface

[model modelname promptTokens replyTokens totalTokens contextSize]

### commands

/model [id]

/share [folder]

/dump

/reset

### work in progress

/load

/save

### reference

More command documentation [roha.md](roha.md)

### development

https://github.com/nitrologic/foundry

# introduction

A command line application designed to chat and share files.

## roha machine interface

The roha functional interface uses tool.

See the OpenAI API spec for more details.

### read_time

### submit_file

### annotate_roha

## roha user interface

commands with no arguments may often prompt for a # index from
the items displayed

### /config

Toggle configuration flags.

Adjust settings to suit current preferences.

Default values are typically:

0 commitonstart : commit shared files on start : true
1 ansi : markdown ANSI rendering : true
2 slow : output at reading speed : true
3 verbose : emit debug information : true
4 broken : ansi background blocks : false
5 logging : log all output to file : true

### /list

Display all shared files.

Includes paths, sizes, and optional tags for each file.

### /share

Share a file or folder with optional tag.

Files are added to the share list used by the /dump /commit /roha command.

### /dump /commit /roha

Refresh shared files. 

Detects changes or deletions and updates the chat history.

Posts new versions of file content if modified.

### /reset

Clear all shared files and conversation history.

### /history

List a summary of recent conversation entries. 

Provides a quick overview of chat history.

### /cd

Change the working directory. 

User can navigate to a desired directory for file operations.

### /dir

List the contents of the current working directory. 

Helps user view available files and folders to share.


### /model

Select an AI model.

User can choose a model by name or index from the accounts available.

### /counters

List the internal application counters.

### /tag

Describe all tags in use.

Displays tag name, count of shares tagged and description.

### /account

Display current account information.

### /save [name]

Save the current conversation history. 

Creates a snapshot file of the conversation.

The default name is currently .roa-save-HEX32_TIME.json

### /load

Load a saved conversation history snapshot.

User can specify a save index or file name to restore previous chats.


### /time

Display the current system time. 

Helps user verify system status.

### /help

If you are reading this file, it may be due to the use of this command.

If you still need help visit the project page.
