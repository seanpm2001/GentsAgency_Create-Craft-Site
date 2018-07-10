#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const cp = require('child_process');
const minimist = require('minimist');
const https = require('https');

const cwd = (() => {
	const argv = minimist(process.argv.slice(2));

	if (argv._ && argv._.length > 0) {
		const dir = argv._.pop();
		return `${process.cwd()}/${dir}`;
	}

	return process.cwd();
})();

const run = (cmd, options = { cwd }) => new Promise((resolve, reject) => {
	cp.exec(cmd, options, (err) => {
		if (err) {
			return reject(err);
		}

		return resolve();
	});
});

const replaceInFile = (src, replacements = {}) => new Promise((resolve, reject) => {
	const file = path.resolve(cwd, src);

	fs.readFile(file, 'utf8', (readErr, data) => {
		if (readErr) {
			return reject(readErr);
		}

		const replaced = Object.entries(replacements)
			.reduce((string, [pattern, replacement]) => string.replace(pattern, replacement), data);

		return fs.writeFile(file, replaced, 'utf8', (writeErr) => {
			if (writeErr) {
				return reject(writeErr);
			}

			return resolve();
		});
	});
});

const downloadFile = (url) => new Promise((resolve, reject) => {
	const filename = path.basename(url);

	return fs.ensureDir(`${__dirname}/tmp`).then(() => {
		const target = `${__dirname}/tmp/${filename}`;
		const file = fs.createWriteStream(target);

		const download = (u) => {
			https.get(u, (res) => {
				if (res.statusCode < 200 || res.statusCode >= 400) {
					reject();
				} else if (res.statusCode >= 300 && res.headers.location) {
					download(res.headers.location);
				} else {
					res.pipe(file);
				}
			});
		};

		file.on('finish', () => {
			file.close(resolve);
			resolve(target);
		});

		file.on('error', (err) => {
			fs.unlink(file);
			reject(err);
		});

		download(url);
	});
});

(async function createCraftSite() {
	console.log(`👋 Creating a new Craft website in ${cwd}`);
	console.log('');
	await fs.ensureDir(cwd);

	console.log('📥 Installing Craft CMS & a front-end setup');
	console.log('☕️ This might take a while');
	console.log('');
	await Promise.all([
		run('npm init @gentsagency/static-site --yes --scope=@gentsagency'),
		run('composer create-project craftcms/craft ./craft'),
	]);

	console.log('🔩 Installing Craft plugins');
	console.log('');
	await run('composer require craftcms/aws-s3', { cwd: `${cwd}/craft` });

	console.log('🤖 Installing nystudio107/craft-scripts');
	console.log('');
	const download = await downloadFile('https://github.com/nystudio107/craft-scripts/archive/master.zip');
	await run(`unzip ${download} -d ${__dirname}/tmp`);
	await fs.move(`${__dirname}/tmp/craft-scripts-master/scripts`, `${cwd}/scripts`);
	await fs.remove(`${__dirname}/tmp`);

	console.log('🚢 Moving some files around');
	console.log('');
	await fs.rename(`${cwd}/www`, `${cwd}/static-www`);

	await Promise.all([
		fs.move(`${cwd}/craft/web`, `${cwd}/www`, { overwrite: true }),
		fs.copy(`${__dirname}/templates/gitignore`, `${cwd}/.gitignore`, { overwrite: true }),
	]);

	const staticFiles = await fs.readdir(`${cwd}/static-www`);
	await Promise.all(staticFiles
		.filter((file) => file !== 'index.html')
		.map((file) => fs.move(`${cwd}/static-www/${file}`, `${cwd}/www/${file}`)));
	await fs.remove(`${cwd}/static-www`);

	console.log('🔧 Tweaking your configuration');
	console.log('');
	await replaceInFile(`${cwd}/www/index.php`, { 'dirname(__DIR__)': '\'../craft\'' });

	console.log('🌱 All set! Let\'s get you started:');
	console.log('');
	console.log(`    cd ${cwd}`);
	console.log('    gulp watch');
	console.log('');
	console.log('🤞 Good luck, have fun!');
}());
