import { ensureFileSync } from "fs-extra";
import {
	readdirSync,
	writeFileSync,
	accessSync,
	constants,
	readFileSync,
} from "node:fs";
import { join } from "node:path";
import request from "request";
import ProgressBar from "progress";
import { PromisePool } from "@supercharge/promise-pool";

interface Option {
	url?: string;
	key: string;
	body?: Buffer;
}

const m3u8_dir = "H:\\App\\static\\m3u8";

function isExists(path: string) {
	try {
		accessSync(path, constants.R_OK | constants.W_OK);
		return true;
	} catch (err) {
		return false;
	}
}

let options: Option[];
function bootstrap() {
	console.log("server is running");
	options = readdirSync(join(m3u8_dir))
		.map((key) => {
			const absolutePath = (filename: string) => {
				return join(m3u8_dir, key, filename);
			};

			const placeholderPath = absolutePath("placeholder.txt");
			if (isExists(placeholderPath)) return undefined;

			const m3u8BackPath = absolutePath("index.m3u8.back");
			if (isExists(m3u8BackPath)) {
				const m3u8BackContent = readFileSync(m3u8BackPath).toString();
				return { body: m3u8BackContent, key };
			}

			const infoPath = absolutePath("info.json");
			if (isExists(infoPath)) {
				const infoContent = readFileSync(infoPath).toString();
				let url = JSON.parse(infoContent)._url;
				url = url.replace("newindex.m3u8", "index.m3u8");
				return { url, key };
			}

			return undefined;
		})
		.filter((el) => !!el) as Option[];

	console.log("收集完成，准备开启下载");
	new Job(options);
}

class Job {
	private options: Option[];
	constructor(options: Option[]) {
		this.options = options;
		this.setup();
	}

	async setup() {
		const option = this.options.shift();
		if (option) {
			await downloadM3u8(option);
			this.setup();
		}
	}
}

interface UrlOption {
	playlist: boolean;
	name: string;
	url: string;
}

async function downloadM3u8(option: Option) {
	const { url, key, body: fileBody } = option;
	console.log("key", key);

	let body = url ? await axios(url) : (fileBody as Buffer);

	const urls = parseURLs(body.toString());
	urls.shift();
	const bar = new ProgressBar("downloading [:bar] :current/:total :percent", {
		complete: "#",
		incomplete: "-",
		width: 20,
		total: urls.length,
	});

	const { results, errors } = await PromisePool.for<UrlOption>(urls)
		.withConcurrency(8)
		.process(async (el) => {
			bar.tick(1);
			const binPath = join(m3u8_dir, key, parseUrlName(el.name));

			if (isExists(binPath)) {
				return;
			} else {
				const body = await axios(el.url);
				writeFileSync(binPath, body);
				return;
			}
		});

	if (errors.length === 0) {
		const placeholderPath = join(m3u8_dir, key, "placeholder.txt");
		ensureFileSync(placeholderPath);
	} else {
		console.log("存有异常", errors);
	}
}

function axios(url: string): Promise<Buffer> {
	return new Promise((resolve) => {
		request(url, { encoding: null, jar: true }, function (err, res, body) {
			resolve(body);
		});
	});
}

function parseURLs(body: String) {
	return body
		.trim()
		.split("\n")
		.map(function (line) {
			line = line.trim();
			if (line[0] === "#") return (line.match(/URI="([^"]+)"/) || [])[1];
			return line;
		})
		.filter(function (line) {
			return line;
		})
		.map(function (u) {
			return {
				playlist: /\.m3u8$/.test(u.split("?")[0]),
				name: u,
				url: u,
			};
		});
}

function parseUrlName(u: string) {
	const s = u.split("/");
	return s[s.length - 1];
}

bootstrap();
