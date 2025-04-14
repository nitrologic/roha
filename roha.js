// roha.js
// a command line file sharing chat application
// (c)2025 Simon Armstrong

// deno run --allow-env --allow-net --allow-read --allow-write roha.js

import { contentType } from "https://deno.land/std@0.224.0/media_types/mod.ts";
import { resolve } from "https://deno.land/std/path/mod.ts";
import OpenAI from "https://deno.land/x/openai@v4.67.2/mod.ts";

const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();

const reader = Deno.stdin.readable.getReader();
const writer = Deno.stdout.writable.getWriter();

async function prompt2(message) {
	if (message) {
		await writer.write(encoder.encode(message));
		await writer.ready;
	}
	Deno.stdin.setRaw(true);
	let inputBuffer = new Uint8Array(0);
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done || !value) break;
			for (const byte of value) {
				if (byte === 0x7F || byte === 0x08) { // Backspace
					if (inputBuffer.length > 0) {
						inputBuffer = inputBuffer.slice(0, -1);
						await writer.write(new Uint8Array([0x08, 0x20, 0x08])); // Erase last char
					}
				} else if (byte === 0x1b) { // Escape sequence
					if(value.length==1){
						Deno.exit(0);
					}
					break;
				} else if (byte === 0x0A || byte === 0x0D) { // Enter key
					await writer.write(encoder.encode("\r\n"));
					let line = decoder.decode(inputBuffer);
					line=line.trim();
					log(">>"+line);
					return line;
				} else {
					await writer.write(new Uint8Array([byte]));
					const buf = new Uint8Array(inputBuffer.length + 1);
					buf.set(inputBuffer);
					buf[inputBuffer.length] = byte;
					inputBuffer = buf;
				}
			}
		}
	} finally {
		Deno.stdin.setRaw(false);
	}
}

const rohaTitle="nitrologic chat client";

const rohaMihi="I am testing the roha chat client. You are a helpful assistant.";

const terminalColumns=120;

const flagNames={
	commitonstart : "commit shared files on start",
	ansi : "markdown ANSI rendering",
	slow : "output at reading speed",
	verbose : "emit debug information",
	broken : "ansi background blocks",
	logging : "log all output to file"
};

const emptyRoha={
	config:{
		commitonstart:true,
		ansi:true,
		slow:false,
		verbose:false,
		broken:false
	},
	tags:{},
	models:{},
	sharedFiles:[],
	saves:[],
	counters:{}
};

function increment(key){
	let i=0;
	if(key in roha.counters){
		i=roha.counters[key]+1;
	}
	roha.counters[key]=i;
	return i
}

var tagList=[];
var modelList=[];
var shareList=[];

const emptyModel={
	name:"empty",account:"",hidden:false,prompts:0,completion:0
}

const emptyTag={
}

// const emptyShare={path,size,modified,hash,tag,id}

let roha=emptyRoha;
let rohaCalls=0;
let listCommand="";
let rohaShares=[];
let currentDir = Deno.cwd();
var rohaHistory;

function resetHistory(){
	rohaHistory = [{role:"system",content:rohaMihi}];
}

function rohaPush(content){
	rohaHistory.push({role: "user",name: "roha",content});
}

resetHistory();

// roaTools

const rohaTools = [{
	type: "function",
	function:{
		name: "get_current_time",
		description: "Returns current time in UTC",
		parameters: {
			type: "object",
			properties: {},
			required: []
		}
	}
},{
	type: "function",
	function:{
		name: "submit_file",
		description: "Submit a file for review",
		parameters: {
			type: "object",
			properties: {
				contentType:{type:"string"},
				content:{type:"string"}
			},
			required: ["contentType","content"]
		}
	}
},{
	type: "function",
	function: {
		name: "annotate_roha",
		description: "Set description of any object",
		parameters: {
			type: "object",
			properties: {
				name: { type: "string" },
				type: { type:"string" },
				description: { type: "string" }
			},
			required: ["name","type","description"]
		}
	}
}];

async function sleep(ms) {
	await new Promise(function(resolve) {setTimeout(resolve, ms);});
}

function measure(o){
	let total=JSON.stringify(o).length;
	return total;
}

let outputBuffer = [];

function echo(){
	let args=arguments.length?Array.from(arguments):[];
	let lines=args.join(" ").split("\n");
	for(let line of lines){
		outputBuffer.push(line.trimEnd());
	}
}

function stripAnsi(text) {
	return text.replace(/\x1B\[\d+(;\d+)*[mK]/g, '');
}

async function log(lines){
	if(roha.config.logging){
		const time = new Date().toISOString();
		for(let line of lines.split("\n")){
			line=stripAnsi(line);
			await Deno.writeTextFile("roha.log",time+" "+line+"\n",{ append: true });
		}
	}
}

async function flush() {
	const delay = roha.config.slow ? 40 : 0;
	for (const line of outputBuffer) {
		console.log(line);
		log(line);
		await sleep(delay);
	}
	outputBuffer=[];
}

function wordWrap(text,cols=terminalColumns){
	var result=[];
	var pos=0;
	while(pos<text.length){
		let line=text.substring(pos,pos+cols);
		let n=line.length;
		if(n==cols){
			var i=line.lastIndexOf(" ",n);
			if(i>0){
				line=line.substring(0,i);
				n=i+1;
			}
		}
		result.push(line);
		pos+=n;
	}
	return result.join("\n");
}

// main roha application starts here

const MaxFileSize=65536;

const appDir = Deno.cwd();
const rohaPath = resolve(appDir,"roha.json");
const accountsPath = resolve(appDir,"accounts.json");
const cachePath=resolve(appDir,"cache");

const modelAccounts = JSON.parse(await Deno.readTextFile(accountsPath));

async function pathExists(path) {
	try {
		const stat = await Deno.stat(path);
		if (!stat.isFile) return false;
		return true;
	} catch (error) {
		if (error instanceof Deno.errors.NotFound) return false;
		if (error instanceof Deno.errors.PermissionDenied) return false;
		throw error;
	}
}

const fileExists = await pathExists(rohaPath);
if (!fileExists) {
	await Deno.writeTextFile(rohaPath, JSON.stringify(emptyRoha));
	echo("Created a new roha.json");
}

const rohaAccount={};
for(let account in modelAccounts){
	let endpoint = await connectAccount(account);
	if(endpoint) rohaAccount[account]=endpoint;
}

function stringify(value, seen = new WeakSet(), keyName = "") {
	if (typeof value === "string") return value;
	if (value === null || typeof value !== "object") return String(value);
	if (typeof value === "function") return "[function]";
	if (seen.has(value)) return keyName ? `[circular (${keyName})]` :"[circular]";
	seen.add(value);
	if (Array.isArray(value)) {
		const items = value.map((item, index) => stringify(item, seen,
		String(index)));
		return `[${items.join(",\n")}]`;
	}
	const entries = Object.entries(value).map(([key, val]) => `${key}: ${stringify(val, seen, key)}`);
	return `{${entries.join(",\n")}}`;
}

async function connectAccount(account) {
	let verbose=roha.config.verbose;
	echo("Connecting to account:", account);
	const config = modelAccounts[account];
	if (!config) return null;
	try{
		const apiKey = Deno.env.get(config.env);
		const endpoint = new OpenAI({ apiKey, baseURL: config.url });
		if(verbose){
			for(const [key, value] of Object.entries(endpoint)){
				let content=stringify(value);
				echo("endpoint:"+key+":"+content);
			}
		}
		const models = await endpoint.models.list();
		const list=[];
		for (const model of models.data) {
			let name=model.id+"@"+account;
			list.push(name);
			if(verbose) echo("model - ",JSON.stringify(model,null,"\t"));
		}
		list.sort();
		modelList=modelList.concat(list);
		return endpoint;
	}catch(error){
		echo(error);
	}
	return null;
}

async function resetModel(name){
	grokModel=name;
	grokFunctions=true;
	echo("with model",name,grokFunctions)
	await writeRoha;
}

function listShares(){
	let shares=roha.sharedFiles;
	for(let i=0;i<shares.length;i++){
		let line=shares[i].path;
		if(shares[i].tag)line+=" ["+shares[i].tag+"]";
		echo(i,line);
	}
}

function listSharedFiles(){
	const list=[];
	let count=0;
	for (const share of roha.sharedFiles) {
		let tags="["+share.tag+"]";
		echo((count++),share.path,share.size,tags);
		list.push(share.id);
	}
	shareList=list;
}

function listSaves(){
	let saves=roha.saves||[];
	for(let i=0;i<saves.length;i++){
		echo(i,saves[i]);
	}
}

async function saveHistory(name) {
	try {
		let timestamp=Math.floor(Date.now()/1000).toString(16);
		let filename=(name||".transmission-"+timestamp)+".json";
		let line="roha chat history snapshot saved to "+filename;
		rohaHistory.push({role:"system",content:line});
		await Deno.writeTextFile(filename, JSON.stringify(rohaHistory,null,"\t"));
		echo(line);
		roha.saves.push(filename);
		await writeRoha();
	} catch (error) {
		console.error("Error saving history:", error.message);
	}
}

async function loadHistory(filename){
	var history;
	try {
		const fileContent = await Deno.readTextFile(filename);
		history = JSON.parse(fileContent);
		echo("History restored from "+filename);
	} catch (error) {
		console.error("Error restoring history:", error.message);
		echo("console error");
		history=[{role:"system",content: "You are a helpful assistant."}];
	}
	return history;
}

const ansiBackgrounds = [
	{ name: "dark0", code: "\x1b[48;5;232m" }, // #1c2526
	{ name: "dark1", code: "\x1b[48;5;233m" }, // #2e3436
	{ name: "dark2", code: "\x1b[48;5;234m" }, // #3d4446
	{ name: "dark3", code: "\x1b[48;5;235m" }, // #4e5456
	{ name: "charcoal", code: "\x1b[48;5;236m" }, // #606668
	{ name: "darkBlue", code: "\x1b[48;5;17m" }, // #00005f
	{ name: "darkGreen", code: "\x1b[48;5;23m" }, // #003f3f
	{ name: "darkMutedPurple", code: "\x1b[48;5;54m" }, // #5f00af
	{ name: "veryDarkBlue", code: "\x1b[48;5;18m" }, // #000087
	{ name: "darkCharcoal", code: "\x1b[48;5;239m" }, // #4e4e4e
	{ name: "mutedNavy", code: "\x1b[48;5;19m" }, // #0000af
	{ name: "deepGray", code: "\x1b[48;5;240m" } // #585858
];

const ansiMoveToEnd = "\x1b[999B";
const ansiSaveCursor = "\x1b[s";
const ansiRestoreCursor = "\x1b[u";

const ansiReplyBlock = ansiBackgrounds[0].code;
const ansiCodeBlock = ansiBackgrounds[6].code;

const rohaPrompt=">";

const ansiItalics = "\x1b[3m";
const ansiReset = "\x1b[0m";
const ansiPurple = "\x1b[1;35m";

function mdToAnsi(md) {
	let broken=roha.config.broken;
	const lines = md.split("\n");
	let inCode = false;
	const result = broken?[ansiReplyBlock]:[];
	for (let line of lines) {
		line=line.trimEnd();
		let trim=line.trim();
		if (trim.startsWith("```")) {
			inCode = !inCode;
			if(inCode){
				result.push(ansiCodeBlock);
				let codeType=trim.substring(3);
				echo("inCode "+codeType);
			}else{
				if (broken) result.push(ansiReplyBlock);
			}
		}else{
			if (!inCode) {
				// headershow
				const header = line.match(/^#+/);
				if (header) {
					const level = header[0].length;
					line = line.substring(level).trim();
					line = ansiPurple + line + ansiReset;
				}
				// bullets
				if (line.startsWith('-') || line.startsWith('*') || line.startsWith('+')) {
					line = '• ' + line.substring(1).trim();
				}
				// bold
				if (line.includes("**")) {
					line = line.replace(/\*\*(.*?)\*\*/g, "\x1b[1m$1\x1b[0m");
				}
				// italic
				line = line.replace(/\*(.*?)\*/g, "\x1b[3m$1\x1b[0m");
				line = line.replace(/_(.*?)_/g, "\x1b[3m$1\x1b[0m");
				// wordwrap
				line=wordWrap(line,terminalColumns);
			}
			result.push(line.trimEnd());
		}
	}
	result.push(ansiReset);
	return result.join("\n");
}

async function hashFile(filePath) {
	const fileContent = await Deno.readFile(filePath);
	const hashBuffer = await crypto.subtle.digest("SHA-256", fileContent);
	const hashArray = new Uint8Array(hashBuffer);
	return Array.from(hashArray).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readRoha(){
	try {
		const fileContent = await Deno.readTextFile(rohaPath);
		roha = JSON.parse(fileContent);
		if(!roha.saves) roha.saves=[];
		if(!roha.counters) roha.counters={};
	} catch (error) {
		console.error("Error reading or parsing roha.json:", error);
		roha=emptyRoha;
	}
}

async function writeRoha(){
	try {
		roha.model=grokModel;
		await Deno.writeTextFile(rohaPath, JSON.stringify(roha, null, "\t"));
	} catch (error) {
		console.error("Error writing to roha.json:", error);
	}
}

async function resetRoha(){
	rohaShares = [];
	roha.sharedFiles=[];
	roha.tags={};
	roha.counters={};
	await writeRoha();
	resetHistory();
	echo("resetRoha","All shares and history reset.");
}


function resolvePath(dir,filename){
	let path=resolve(dir,filename);
	path = path.replace(/\\/g, "/");
	return path;
}

// callers to addShare expected to await writeRoha after

async function addShare(share){
	share.id="share"+increment("shareCount");
	roha.sharedFiles.push(share);
	if(share.tag) {
		await setTag(share.tag,share.id);
	}
}

async function shareDir(dir,tag) {
	try {
		const paths=[];
		const files = await Deno.readDir(dir);
		for await (const file of files) {
			if (file.isFile && !file.name.startsWith(".")) {
				paths.push(resolvePath(dir, file.name));
			}
		}
		for (const path of paths) {
//			echo("statting path:"+path+":");
			const info = await Deno.stat(path);
			let size=info.size;
			let modified=info.mtime.getTime();
			const hash = await hashFile(path);
			await addShare({path,size,modified,hash,tag})
		}
		await writeRoha(); // TODO: check a dirty flag
	} catch (error) {
		console.error("### Error"+error);
	}
}

function fileType(extension){
	return contentType(extension) || 'application/octet-stream';
}

const textExtensions = [
	"js", "txt", "json", "md",
	"css","html", "svg",
	"cpp", "c", "h", "cs",
	"sh", "bat",
	"log","py","csv","xml","ini"
];

async function shareFile(path,tag) {
	let fileContent=null;
	try {
		fileContent = await Deno.readFile(path);
	} catch (error) {
		console.error("shareFile path:"+path+" error:", error);
		return;
	}
	if(path.endsWith("rules.txt")){
		let lines=decoder.decode(fileContent).split("\n");
		for(let line of lines ){
			if (line) rohaHistory.push({role:"system",content: line});
		}
	}else{
		const length=fileContent.length;
		if(length>0 && length<MaxFileSize){
			const extension = path.split('.').pop();
			const type = fileType(extension);
			if (textExtensions.includes(extension)) {
				let txt = decoder.decode(fileContent);
				if(txt.length){
					let metadata=JSON.stringify({path,length,type,tag});
					rohaPush(metadata);
					rohaPush(txt);
				}
			}else{
				const base64Encoded = btoa(String.fromCharCode(...new Uint8Array(fileContent)));
				const mimeType = fileType(extension);

				let metadata=JSON.stringify({path,length,type,mimeType,tag});
				rohaPush(metadata);
				let binary=`File content: MIME=${mimeType}, Base64=${base64Encoded}`;
				rohaPush(binary);
			}
		}
	}
//	if(roha.config.verbose)echo("roha shared file " + path);
	if (!rohaShares.includes(path)) rohaShares.push(path);
}

async function commitShares(tag) {
	let dirty = false;
	const validShares = [];
	const removedPaths = [];

	for (const share of roha.sharedFiles) {
		if (tag && share.tag !== tag) {
			validShares.push(share);
			continue;
		}
		try {
			const info = await Deno.stat(share.path);
			const modified = share.modified !== info.mtime.getTime();
			const isShared = rohaShares.includes(share.path);
			if (modified || !isShared) {
				await shareFile(share.path,tag);
				share.modified = info.mtime.getTime();
				dirty = true;
			}
			validShares.push(share);
		} catch (error) {
			removedPaths.push(share.path);
			dirty = true;
		}
	}

	if (removedPaths.length) {
		roha.sharedFiles = validShares;
		await writeRoha();
		echo(`Removed invalid shares:\n${removedPaths.join('\n')}`);
	}

	if (dirty) {
		let invoke="Please annotate roha name "+tag+" type tag /annotate_roha";
		rohaHistory.push({role:"system",content:invoke});
	}

	return dirty;
}

async function setTag(name,note){
	let tags=roha.tags||{};
	let tag=(tags[name])?tags[name]:{name,info:[]};
	tag.info.push(note);
	tags[name]=tag;
	roha.tags=tags;
	await writeRoha();
//	let invoke=`New tag "${name}" added. Describe all shares with this tag.`;
//	rohaHistory.push({role:"system",content:invoke});
}
function listCounts(){
	let keys=Object.keys(roha.counters);
	let i=0;
	for(let key of keys){
		let count=roha.counters[key];
		echo((i++),key,count);
	}
}
function listTags(){
	let tags=roha.tags||{};
	let keys=Object.keys(tags);
	let list=[];
	for(let i=0;i<keys.length;i++){
		let tag=tags[keys[i]];
		const name=tag.name||"?????";
		echo(i,name,"("+tag.info.length+")");
		let info=tag.description;
		if(info) echo("",info);
		list.push(name);
	}
	tagList=list;
}

function listAccounts(){
	let list=[];
	for(let key in modelAccounts){
		let value=modelAccounts[key];
		list.push(key);
	}
	for(let i=0;i<list.length;i++){
		echo(i,list[i]);
	}
}

async function showHelp() {
	try {
		const md = await Deno.readTextFile("roha.md");
		echo(mdToAnsi(md));
	} catch (e) {
		echo("Error loading help file: " + e.message);
	}
}

function readable(text){
	text=text.replace(/\s+/g, " ");
	return text;
}

async function callCommand(command) {
	let dirty=false;
	let words = command.split(" ",2);
	try {
		switch (words[0]) {
			case "count":
				listCounts();
				break;
			case "tag":
				await listTags();
				break;
			case "account":
				await listAccounts();
				break;
			case "help":
				await showHelp();
				break;
			case "config":
				if(words.length>1){
					let flag=words[1].trim();
					if(flag.length && !isNaN(flag)){
						flag=Object.keys(flagNames)[flag|0];
						echo("flag",flag);
					}
					if(flag in flagNames){
						roha.config[flag]=!roha.config[flag];
						echo(flag+" - "+flagNames[flag]+" is "+(roha.config[flag]?"true":"false"));
						await writeRoha();
					}
				}else{
					let count=0;
					for(let flag in flagNames){
						echo((count++),flag,":",flagNames[flag],":",(roha.config[flag]?"true":"false"))
					}
					listCommand="config";
				}
				break;
			case "time":
				echo("Current time:", new Date().toString());
				break;
			case "history":
				let history=rohaHistory;
				for(let i=0;i<history.length;i++){
					let item=history[i];
					let content=readable(item.content).substring(0,90)
					echo(i,item.role,item.name||"guest",content);
				}
				if(roha.config.broken){
					let flat=squashMessages(rohaHistory);
					for(let i=0;i<flat.length;i++){
						let item=flat[i];
						let content=readable(item.content).substring(0,90);
						echo("flat",i,item.role,item.name||"guest",content);
					}
				}
				break;
			case "load":
				let save=words[1];
				if(save){
					if(save.length && !isNaN(save)) save=roha.saves[save|0];
					if(roha.saves.includes(save)){
						let history=await loadHistory(save);
						rohaHistory=history;
					}
				}else{
					listSaves();
				}
				break;
			case "save":
				let savename=words.slice(1).join(" ");
				saveHistory(savename);
				await writeRoha();
				break;
			case "model":
				let name=words[1];
				if(name){
					if(name.length&&!isNaN(name)) name=modelList[name|0];
					if(modelList.includes(name)){
						resetModel(name);
					}
				}else{
					for(let i=0;i<modelList.length;i++){
						let name=modelList[i];
						let attr=(name==grokModel)?"*":"";
						echo(i,name,attr);
					}
					listCommand="model";
				}
				break;
			case "list":
				await listSharedFiles();
				break;
			case "reset":
				await resetRoha();
				break;
			case "cd":
				if(words.length>1){
					const newDir = words[1];
					if (newDir.length) Deno.chdir(newDir);
				}
				currentDir = Deno.cwd();
				echo("Changed directory to", currentDir);
				break;
			case "dir":
				const files = Deno.readDirSync(currentDir);
				echo("Contents of", currentDir + ":");
				for (const file of files) {
					echo(file.name);
				}
				break;
			case "share":
				if (words.length>1) {
					const filename = words[1];
					const path = resolvePath(Deno.cwd(), filename);
					const info = await Deno.stat(path);
					const tag = await prompt2("Enter tag name (optional):");
					if(info.isDirectory){
						echo("Share directory path:",path);
						await shareDir(path,tag);
					}else{
						let size=info.size;
						let modified=info.mtime.getTime();
						echo("Share file path:",path," size:",info.size," ");
						const hash = await hashFile(path);
						echo("hash:",hash);
						await addShare({path,size,modified,hash,tag});
					}
					await writeRoha();
				}else{
					listShares();
				}
				break;
			case "roha":
			case "dump":
			case "commit":
				let tag="";
				if(words.length>1){
					tag=words[1];
				}
				dirty=await commitShares(tag);
				break;
			default:
				echo("Command not recognised");
				return false; // Command not recognized
		}
	} catch (error) {
		echo("Error processing command:", error.message);
	}
	return dirty;
}

echo(rohaTitle,"running from "+rohaPath);
await readRoha();
echo("shares count:",roha.sharedFiles.length)
echo("use /help for latest");

let grokModel = roha.model||"deepseek-chat@deepseek";
let grokFunctions=true;
let grokUsage = 0;

echo("prompting with ",grokModel);

let sessions=increment("sessions");
if(sessions==0){
	let welcome=await Deno.readTextFile("welcome.txt");
	echo(welcome);
	await writeRoha();
}

if(roha.config){
	if(roha.config.commitonstart) await commitShares();
}else{
	roha.config={};
}

function extensionForType(contentType) {
	if (contentType.includes("markdown")) return ".md";
	if (contentType.includes("json")) return ".json";
	if (contentType.includes("javascript")) return ".js";
	return ".txt";
}

async function onCall(toolCall) {
	let verbose=roha.config.verbose;
	switch(toolCall.function.name) {
		case "submit_file":
			let args=JSON.parse(toolCall.function.arguments);
			echo(args.contentType);
			if (verbose) echo(args.content);
			let timestamp=Math.floor(Date.now()/1000).toString(16);
			let extension=extensionForType(args.contentType)
			let name= "submission-"+timestamp+extension;
			let filePath = resolve(cachePath,name);
			await Deno.writeTextFile(filePath, args.content);
			echo("File saved to:", filePath);
			return { success: true, path: filePath };
		case "get_current_time":
			return {time: new Date().toISOString()};
		case "annotate_roha":
			try {
				const { name, type, description } = JSON.parse(toolCall.function.arguments || "{}");
				switch(type){
					case "tag":
						if(!(name in roha.tags)) throw("tag not found");
						roha.tags[name].description=description;
						break;
					case "save":
						if(!(name in roha.saves)) throw("save not found");
						roha.saves[name].description=description;
						break;
				}
				await writeRoha(); // Persist changes
				return { success: true, updated: 1 };
			} catch (error) {
				echo("annotate_roha error:",error);
				return { success: false, updated: 0 };
			}
	}
	console.error("onCall error - call simon");
}

function squashMessages(history) {
	if (history.length < 2) return history;
	const squashed = [history[0]];
	let system=[];
	let other=[];
	for(let item of history){
		if(item.role=="system") system.push(item); else other.push(item);
	}
	for(let list of [system,other]){
		let last=null;
		for (let i = 0; i < list.length; i++) {
			const current=list[i];
			if(last){
				last.content += "\n" + current.content;
			} else {
				squashed.push(current);
				last=current;
			}
		}
	}
	return squashed;
}

async function relay() {
	try {
		const modelAccount=grokModel.split("@");
		let model=modelAccount[0];
		let account=modelAccount[1];
		let endpoint=rohaAccount[account];
		const payload = grokFunctions?{ model, messages:rohaHistory, tools: rohaTools }:{ model, messages:squashMessages(rohaHistory) };
		const completion = await endpoint.chat.completions.create(payload);
		if (completion.model != model) {
			echo("[relay model alert model:" + completion.model + " grokModel:" + grokModel + "]");
		}
		if (roha.config.verbose) {
			// echo("relay completion:" + JSON.stringify(completion, null, "\t"));
		}
		let usage = completion.usage;
		let size = measure(rohaHistory);
		grokUsage += usage.prompt_tokens | 0 + usage.completion_tokens | 0;
		let status = "[model " + grokModel + " " + usage.prompt_tokens + " " + usage.completion_tokens + " " + grokUsage + " " + size + "]";
		echo(status);
		var reply = "<blank>";
		for (const choice of completion.choices) {
			let calls = choice.message.tool_calls;
			if (calls) {
				echo("relay calls in progress");
				// Generate tool_calls with simple, unique IDs
				const toolCalls = calls.map((tool, index) => ({
					id: `call_${rohaCalls++}`,
					type: "function",
					function: {
						name: tool.function.name,
						arguments: tool.function.arguments || "{}"
					}
				}));
				// Add assistant message with tool_calls
				rohaHistory.push({
					role: "assistant",
					content: choice.message.content || "",
					tool_calls: toolCalls
				});
				// Add tool responses
				for (let i = 0; i < calls.length; i++) {
					const tool = calls[i];
					const result = await onCall(tool);
					if (result){
						let content=JSON.stringify(result);
						rohaHistory.push({
							role: "tool",
							tool_call_id: toolCalls[i].id,
							name: tool.function.name,
							content
						});
					}else{
						echo("no oncall result");
					}
				}
				return relay(); // Recursive call to process tool results
			}
			reply = choice.message.content;
			if (roha.config && roha.config.ansi) {
//				echo(ansiSaveCursor);
				echo(mdToAnsi(reply));
//				echo(ansiRestoreCursor);
			} else {
				echo(wordWrap(reply));
			}
		}
		rohaHistory.push({ role: "assistant", content: reply });
	} catch (error) {
		console.error("Error during API call:", error);
		if(grokFunctions){
			echo("resetting grokFunctions")
			grokFunctions=false;
		}
	}
}

async function chat() {
	dance:
	while (true) {
		let lines=[];
//		echo(ansiMoveToEnd);
		while (true) {
			await flush();
			let line="";
			if(listCommand){
				line=await prompt2("#");
				if(line.length && !isNaN(line)){
					let index=line|0;
					await callCommand(listCommand+" "+index);
				}
				listCommand="";
			}else{
				line=await prompt2(rohaPrompt);
			}
			if (line === '') break;
			if (line === "exit") {
				echo("Ending the conversation...");
				break dance;
			}
			if (line.startsWith("/")) {
				const command = line.substring(1).trim();
				let dirty=await callCommand(command);
				if(dirty){
					lines.push("Please review source for bugs and all content if notable changes detected, thanks.");
					break;
				}
				continue;
			}
			lines.push(line.trim());
		}
		if (lines.length){
			const query=lines.join("\n");
			if(query.length){
				rohaHistory.push({ role: "user", content: query });
				await relay();
			}
		}
	}
}


// todo: add save on exit

Deno.addSignalListener("SIGINT", () => {Deno.exit(0);});

chat();
