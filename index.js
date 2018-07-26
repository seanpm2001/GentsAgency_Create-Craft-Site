#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const cp = require('child_process');
const minimist = require('minimist');
const https = require('https');

const argv = minimist(process.argv.slice(2));

const cwd = (() => {
	if (argv._ && argv._.length > 0) {
		const dir = argv._.pop();
		return `${process.cwd()}/${dir}`;
	}

	return process.cwd();
})();

const requestsS3Bucket = typeof argv.s3 !== 'undefined';

const run = (cmd, options = { cwd }) => new Promise((resolve, reject) => {
	cp.exec(cmd, options, (err, stdout) => {
		if (err) {
			return reject(err);
		}

		return resolve(stdout);
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

const createBucket = async (bucket) => {
	const hasAwsCli = await (async () => {
		try {
			const accessKey = await run('aws configure get aws_access_key_id');
			return !!accessKey;
		} catch (error) {
			return false;
		}
	})();

	if (hasAwsCli) {
		await run(`aws s3 mb s3://${bucket}`);
		await run(`aws s3api put-bucket-acl --bucket ${bucket} --grant-read 'uri="http://acs.amazonaws.com/groups/global/AllUsers"'`);
	} else {
		throw new Error('The AWS CLI is not installed or configured correctly');
	}
};

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

	const plugins = [
		'craftcms/redactor',
		'gentsagency/craft-inline-icons',
		'gentsagency/craft-responsive-images',
	];

	if (requestsS3Bucket) {
		plugins.push('craftcms/aws-s3');
	}

	await run(`composer require ${plugins.join(' ')}`, { cwd: `${cwd}/craft` });

	console.log('🤖 Installing nystudio107/craft-scripts');
	console.log('');
	const download = await downloadFile('https://github.com/nystudio107/craft-scripts/archive/master.zip');
	await run(`unzip ${download} -d ${__dirname}/tmp`);
	await fs.move(`${__dirname}/tmp/craft-scripts-master/scripts`, `${cwd}/scripts`);
	await fs.remove(`${__dirname}/tmp`);

	if (requestsS3Bucket) {
		try {
			const bucket = typeof argv.s3 === 'string' ? argv.s3 : path.basename(cwd);

			console.log(`🌅 Creating a '${bucket}' bucket on S3`);
			console.log('');

			await createBucket(bucket);
		} catch (error) {
			console.log('    Something went wrong while creating & configuring the S3 bucket.');
			console.log('    You will have to do this manually.');
			console.log('');
		}
	}

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
	await Promise.all([
		fs.remove(`${cwd}/www/web.config`),
		fs.appendFile(`${cwd}/www/.htaccess`, `
<IfModule mod_headers.c>
	Header always set Referrer-Policy "strict-origin-when-cross-origin"
	Header always set Strict-Transport-Security "strict-transport-security: max-age=31536000; includeSubDomains"
	Header always set X-Content-Type-Options "nosniff"
	Header always set X-Frame-Options "SAMEORIGIN"
	Header always set X-XSS-Protection "1; mode=block"
	Header always set Content-Security-Policy "default-src 'self' ; script-src 'self' 'unsafe-inline' 'unsafe-eval' ; style-src 'self' 'unsafe-inline' ; img-src * ; font-src * ; connect-src 'self' ; object-src 'none' ; child-src 'self' ; frame-src 'self' ; worker-src 'self' ; frame-ancestors 'self' ; form-action 'self' ; manifest-src 'self' ; upgrade-insecure-requests; report-uri https://gents.report-uri.com/r/d/csp/enforce;"
</IfModule>`),
		replaceInFile(`${cwd}/www/index.php`, { 'dirname(__DIR__)': '\'../craft\'' }),
	]);

	console.log('🌱 All set! Let\'s get you started:');
	console.log('');
	console.log(`    cd ${cwd}`);
	console.log('    gulp watch');
	console.log('');
	console.log('🤞 Good luck, have fun!');
}());
