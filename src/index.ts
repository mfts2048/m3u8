import {
	readdirSync,
	readFileSync,
	existsSync,
	writeFileSync,
	ensureFileSync,
} from "fs-extra";
import { join } from "node:path";
import request from "request";
import ProgressBar from "progress";
import { PromisePool } from "@supercharge/promise-pool";

interface Option {
	url?: string;
	key: string;
	body?: string;
}

const m3u8_dir = "H:\\App\\static\\m3u8";

let options: Option[];
function bootstrap() {
	console.log("server is running");
	options = readdirSync(join(m3u8_dir))
		.reverse()
		.map((key) => {
			const file_path = join(m3u8_dir, key, "info.json");
			if (existsSync(file_path)) {
				const file_content = readFileSync(file_path);
				let url = JSON.parse(file_content.toString())._url;
				url = url.replace("newindex.m3u8", "index.m3u8");

				return { url, key };
			}

			const meu3_back_path = join(m3u8_dir, key, "index.m3u8.back");
			if (existsSync(meu3_back_path)) {
				const body = readFileSync(meu3_back_path);
				return { body, key };
			}

			return undefined;
		})
		.filter((el) => !!el) as Option[];

	performJob(0);
}

function performJob(index: number) {
	const option = options[index];
	if (option) {
		downloadM3u8(option, () => {
			performJob(index + 1);
		});
	}
}

interface UrlOption {
	playlist: boolean;
	name: string;
	url: string;
}

function downloadM3u8(option: Option, callback: Function) {
	const { url, key, body: fileBody } = option;
	console.log("key", key);
	const placeholderPath = join(m3u8_dir, key, "placeholder.txt");

	if (existsSync(placeholderPath)) {
		return callback();
	}

	const doBin = async (body: string) => {
		const urls = parseURLs(body);
		urls.shift();
		const bar = new ProgressBar(
			"  downloading [:bar] :current/:total :percent",
			{
				complete: "-",
				incomplete: " ",
				width: 20,
				total: urls.length,
			},
		);

		const { results, errors } = await PromisePool.for<UrlOption>(urls)
			.withConcurrency(8)
			.process(async (el) => {
				bar.tick(1);
				const binPath = join(m3u8_dir, key, parseUrlName(el.name));

				if (existsSync(binPath)) {
					return;
				} else {
					const body = await axios(el.url);
					writeFileSync(binPath, body);
					return;
				}
			});

		if (errors.length === 0) {
			ensureFileSync(placeholderPath);
		} else {
			console.log("存有异常", errors);
		}
		callback();
	};

	if (url) {
		axios(url).then((body) => {
			doBin(body.toString());
		});
	} else if (fileBody) {
		doBin(fileBody.toString());
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
