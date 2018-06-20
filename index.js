#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const mkdirp = require('mkdirp');
const minimist = require('minimist');

const cwd = (() => {
	const argv = minimist(process.argv.slice(2));

	if (argv._ && argv._.length > 0) {
		const dir = argv._.pop();
		return `${process.cwd()}/${dir}`;
	}

	return process.cwd();
})();

const run = (cmd) => new Promise((resolve, reject) => {
	cp.exec(cmd, { cwd }, (err) => {
		if (err) {
			return reject(err);
		}

		return resolve();
	});
});

const createDirectory = (dir) => new Promise((resolve, reject) => {
	mkdirp(dir, (err) => {
		if (err) {
			return reject(err);
		}

		return resolve();
	});
});

const copyFile = (src, dest) => new Promise((resolve, reject) => {
	const read = fs.createReadStream(`${__dirname}/templates/${src}`);

	read.on('error', (err) => reject(err));

	const write = fs.createWriteStream(`${cwd}/${dest || src}`);

	write.on('error', (err) => reject(err));

	write.on('close', () => resolve());

	read.pipe(write);
});

const copyDirectory = (src, dest) => run(`cp -r ${__dirname}/templates/${src} ${cwd}/${dest || src}`);

const removeFile = (src) => run(`rm ${src}`);

const removeDirectory = (src) => run(`rm -r ${src}`);

const move = (src, dest) => run(`mv ${src} ${dest}`);

const moveFile = (...args) => move(...args);

const moveDirectory = (...args) => move(...args);

const replaceInFile = (src, replacements = {}) => new Promise((resolve, reject) => {
	const file = path.resolve(cwd, src);

	fs.readFile(file, 'utf8', (readErr, data) => {
		if (readErr) {
			return reject(readErr);
		}

		const replaced = Object.entries(replacements).reduce((string, [pattern, replacement]) => string.replace(pattern, replacement), data);

		return fs.writeFile(file, replaced, 'utf8', (writeErr) => {
			if (writeErr) {
				return reject(writeErr);
			}

			return resolve();
		});
	});
});

(async function createCraftSite() {
	console.log(`👋 Creating a new Craft website in ${cwd}`);
	console.log('');
	await createDirectory(cwd);

	console.log('📥 Installing Craft CMS & a front-end setup');
	console.log('☕️ This might take a while');
	console.log('');
	await Promise.all([
		await run('npm init @gentsagency/static-site --yes --scope=@gentsagency'),
		await run('composer create-project craftcms/craft ./craft'),
	]);

	console.log('🚢 Moving some files around');
	console.log('');
	await removeDirectory('./www');
	await moveDirectory('./craft/web', './www');
	await removeFile('.gitignore');
	await copyFile('gitignore', '.gitignore');

	console.log('🔧 Tweaking your configuration');
	console.log('');
	await replaceInFile('./www/index.php', { 'dirname(__DIR__)': '\'../craft\'' });

	console.log('🌱 All set! Let\'s get you started:');
	console.log('');
	console.log(`    cd ${cwd}`);
	console.log('    gulp watch');
	console.log('');
	console.log('🤞 Good luck, have fun!');
}());
