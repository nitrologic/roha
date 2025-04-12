// roha.js
// a command line file sharing chat application
// (c)2025 Simon Armstrong

// deno run --allow-env --allow-net --allow-read --allow-write roha.js

import { contentType } from "https://deno.land/std@0.224.0/media_types/mod.ts";
import { exists } from "https://deno.land/std/fs/exists.ts";
import { resolve } from "https://deno.land/std/path/mod.ts";
import OpenAI from "https://deno.land/x/openai@v4.67.2/mod.ts";

const terminalColumns=80;

var grokHistory;

resetHistory();

// simon not grok was here
function measure(o){
	let total=JSON.stringify(o).length;
	return total;
}

function echo(...args){
	console.log(...args);
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

let markdownEnabled = true;

let verbose=true;

const MaxFileSize=65536;
const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();

const appDir = Deno.cwd();
const rohaPath = resolve(appDir,"roha.json");
const accountsPath = resolve(appDir,"accounts.json");

const modelAccounts = JSON.parse(await Deno.readTextFile(accountsPath));
const modelList=[];

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

async function connectModel(name,silent) {
	echo("Connecting to model:", name);
	const config = modelAccounts[name];
	if (!config) return null;
	const apiKey = Deno.env.get(config.env);
	const endpoint = new OpenAI({ apiKey, baseURL: config.url });
	if(!silent){
		for(const [key, value] of Object.entries(endpoint)){
			let content=stringify(value);
			echo("endpoint:"+key+":"+content);
		}
	}
	const models = await endpoint.models.list();                                                                                                                                           
	for (const model of models.data) {                                                                                                                                                     
		modelList.push(model.id);                                                                                                                                                 
//		if(verbose) echo("model:"+JSON.stringify(model));
	}
	return endpoint;
}

function resetModel(name){
	grokModel=name;
}

// persistant model selection not quite there

let grokModel = "grok-3-beta";
let grok = await connectModel("xai",true);

//let grokModel = "o3-mini-2025-01-31";
//let grok = await connectModel("openai",true);
let grokUsage = 0;

let roha={sharedFiles:[],saves:[]};
//let sharedFiles=[];
let shares=[];
let currentDir = Deno.cwd();

function dumpShares(){
	let shares=roha.sharedFiles;
	for(let i=0;i<shares.length;i++){
		echo(i,shares[i].path);
	}
}

function listSaves(){
	let saves=roha.saves;
	for(let i=0;i<saves.length;i++){
		echo(i,saves[i]);
	}
}

function resetHistory(){
	grokHistory = [{ role: "system", content: "You are a helpful assistant." }];
}

function manageHistory(path) {
	const indices = grokHistory
		.map((entry, index) => (entry.content.includes(`path=${path},`) ? index : -1))
		.filter(index => index !== -1);	
	//echo(`manageHistory Found ${indices.length} history entries for ${path}`);
	for(let i=indices.length-3;i>=0;i--){
		let index=indices[i];
		// remove the filetype and content message from biggest to smallest
		grokHistory.splice(index,2);
	}
}

async function saveHistory() {
	try {
		let timestamp=Math.floor(Date.now()/1000).toString(16);
		let filename=".roha-save-"+timestamp+".json";
		let line="history snapshot saved to "+filename;
		grokHistory.push({role: "system",content: line});
		await Deno.writeTextFile(filename, JSON.stringify(grokHistory,null,"\t"));
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
		history = [{ role: "system", content: "You are a helpful assistant."}];	
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

const ansiReplyBlock = ansiBackgrounds[0].code;
const ansiCodeBlock = ansiBackgrounds[6].code;

const rohaPrompt=">";

const ansiItalics = "\x1b[3m";
const ansiReset = "\x1b[0m";
const ansiPurple = "\x1b[1;35m";
function mdToAnsi(md) {
	const lines = md.split("\n");
	let inCode = false;
	const result = [ansiReplyBlock];
	for (let line of lines) {
		line=line.trimEnd();
		let trim=line.trim();
		if (trim.startsWith("```")) {
			inCode = !inCode;
			if(inCode){
				result.push(ansiCodeBlock);
			}else{
				result.push(ansiReplyBlock);
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
				// bold
				if (line.includes("**")) {
					line = line.replace(/\*\*(.*?)\*\*/g, "\x1b[1m$1\x1b[0m");
				}
				// italic
				line = line.replace(/\*(.*?)\*/g, "\x1b[3m$1\x1b[0m");
				line = line.replace(/_(.*?)_/g, "\x1b[3m$1\x1b[0m");
				// bullets
				if (line.startsWith('-') || line.startsWith('*') || line.startsWith('+')) {
					line = '• ' + line.substring(1).trim();
				}
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

const fileExists = await exists(rohaPath);
if (!fileExists) {
	await Deno.writeTextFile(rohaPath, JSON.stringify({shares:[],sharedFiles:[]}));
	echo("Created a new roha.json");
}

async function readRoha(){
	try {
		const fileContent = await Deno.readTextFile(rohaPath);
		roha = JSON.parse(fileContent);
//		echo("Loaded sharedFiles:", sharedFiles);
	} catch (error) {
		console.error("Error reading or parsing roha.json:", error);
		roha={sharedFiles:[]};
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

function resolvePath(dir,filename){
	let path=resolve(dir,filename);
	path = path.replace(/\\/g, "/");
	return path;
}

function addShare(share){
	roha.sharedFiles.push(share);
}

async function shareDir(dir) {
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
			addShare({path,size,modified,hash})
		}
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

async function shareFile(path) {
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
			if (line) grokHistory.push({role: "system",content: line});
		}
	}else{
		const length=fileContent.length;
		if(length>0 && length<MaxFileSize){
			const extension = path.split('.').pop();
			const type = fileType(extension);
//			fileshare+={path,history.length}
			grokHistory.push({role: "user",content: `File metadata: path=${path}, length=${length} bytes`});
			if (textExtensions.includes(extension)) {
				let txt = decoder.decode(fileContent);
				if(txt.length){
					grokHistory.push({role:"user",content:txt});
				}
			}else{
				const base64Encoded = btoa(String.fromCharCode(...new Uint8Array(fileContent)));
				const mimeType = fileType(extension);
				grokHistory.push({role: "user",content: `File content: MIME=${mimeType}, Base64=${base64Encoded}`});
			}
		}
	}
	if(verbose)echo("roha shared file " + path);
	if (!shares.includes(path)) shares.push(path);
}

async function callCommand(command) {
	let dirty=false;
	let words = command.split(" ",2);  
	try {
		switch (words[0]) {
			case "markdown":
				markdownEnabled = !markdownEnabled;
				echo("Markdown rendering " + (markdownEnabled ? "enabled" : "disabled"));
				break;	
			case "load":
				let save=words[1];
				if(save){
					if(!isNaN(save)) save=roha.saves[save|0];
					if(roha.saves.includes(save)){
						let history=await loadHistory(save);
						grokHistory=history;
					}
				}else{
					listSaves();
				}
				break;
			case "save":
				saveHistory();
				await writeRoha();
				break;
			case "model":
				let name=words[1];
				if(name){
					if(!isNaN(name)) name=modelList[name|0];				
					if(modelList.includes(name)){
						resetModel(name);
					}
				}else{
					for(let i=0;i<modelList.length;i++){
						echo(i,modelList[i]);
					}
				}
				break;
			case "list":
				for (const share of roha.sharedFiles) {
					echo("share path:"+share.path+" size:"+share.size);
				}
				break;
			case "reset":
				shares = [];
				roha.sharedFiles=[];
				await writeRoha();
				resetHistory();
				echo("All shares and history reset.");
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
					if(info.isDirectory){
						echo("Share directory path:",path);
						await shareDir(path);
					}else{
						let size=info.size;
						let modified=info.mtime.getTime();
						echo("Share file path:",path," size:",info.size," ");
						const hash = await hashFile(path);
						echo("hash:",hash);
						addShare({path,size,modified,hash});
					}
					await writeRoha();
				}else{
					dumpShares();
				}
				break;
			case "dump":
//				echo("dump:"+shares.join(" "));
				for(let share of roha.sharedFiles){
					const path = share.path;
//					echo("dump statting path:"+path+":"+JSON.stringify(share));
					const info = await Deno.stat(path);
					let modified=share.modified!=info.mtime.getTime();
//					if(modified)echo("modified",info.mtime.getTime(),share.modified);
					let isShared=shares.includes(path);
					if (modified || !isShared) {
						shareFile(path);
						share.modified=info.mtime.getTime();
//						manageHistory(path);
						dirty=true;
					}
				}
				break;
			default:
				return false; // Command not recognized
		}
	} catch (error) {
		echo("Error processing command:", error.message);
	}
	return dirty;
}

echo("nitrologic chat client");
echo("connected to "+grok.baseURL);
echo("running from "+rohaPath);

await readRoha();
echo("shares count:",roha.sharedFiles.length)

async function relay(){
	try{
		const completion = await grok.chat.completions.create({model:grokModel,messages:grokHistory,});
		if (completion.model!=grokModel){
			echo("[relay model alert model:"+completion.model+" grokModel:"+grokModel+"]");
		}
		if(verbose){
//			echo("relay completion:"+JSON.stringify(completion, null, "\t"));
		}
		let usage=completion.usage;
		let size=measure(grokHistory);
		grokUsage+=usage.prompt_tokens|0+usage.completion_tokens|0;
		let status="[model "+grokModel+" "+usage.prompt_tokens+" "+usage.completion_tokens+" "+grokUsage+" "+size+"]";
		console.log("status:"+status);
		echo(status);
		var reply = "<blank>";
		for(const choice of completion.choices){
			reply = choice.message.content;
			echo(markdownEnabled?mdToAnsi(reply):wordWrap(reply));
		}
		grokHistory.push({ role: "assistant", content: reply });
	} catch( error ){
		console.error("Error during API call:", error);
	}
}
async function chat() {
	dance:
	while (true) {
		let lines=[];
		while (true) {
			const line = prompt(rohaPrompt);
			if (line === '') break;
			if (line === "exit") {
				echo("Ending the conversation...");
				break dance;
			}
			if (line.startsWith("/")) {
				const command = line.substring(1).trim();
				let dirty=await callCommand(command);
				if(dirty){
					lines.push("ok");
					break;
				}
				continue;
			}
			lines.push(line.trim());
		}
		if (lines.length){
			const query=lines.join("\n");
			if(query.length){
				grokHistory.push({ role: "user", content: query });
				await relay();
			}
		}
	}
}

chat();

