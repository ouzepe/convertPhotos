const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const mkdirp = require('mkdirp');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length - 1;

const sizes = [100, 200, 300, 600, 800, 1024, 1600];
const srcDir = path.join(__dirname, './originaux');
const destDir = path.join(__dirname, '../media');

if (cluster.isMaster) {
	console.log('\x1b[33m' + `Ce script ne prend que les images en .jpg`);

	const files = fs.readdirSync(srcDir);
	const images = files
		.filter(f => {
			const { ext } = path.parse(f);
			return ext === '.jpg';
		})
		.map(img => path.join(srcDir, img));

	let lastIndex = -1;
	let treatedCount = 0;

	let i = numCPUs;
	while (i--) {
		const worker = cluster.fork();

		worker.on('message', num => {
			if (num) {
				process.stdout.write(
					`${((++treatedCount / images.length) * 100).toFixed(
						2,
					)}% | Le worker ${worker.id} a traité le n°${images.indexOf(num) +
						1}\r`,
				);
			}
			lastIndex++;
			if (!images[lastIndex]) worker.kill();
			else worker.send(images[lastIndex]);
		});

		worker.on('exit', _ =>
			console.log(`\nLe worker ${worker.id} s'est terminé.`),
		);
	}
} else {
	process.send('');

	process.on('message', async srcImg => {
		// On crée le dossier
		await new Promise((resolve, reject) => {
			const { name } = path.parse(srcImg);
			const dir = path.join(destDir, name);
			fs.access(dir, err => {
				if (err) {
					mkdirp(dir, error => (error ? reject(error) : resolve()));
				} else {
					resolve();
				}
			});
		});

		const { name } = path.parse(srcImg);
		const conversions = [];

		sizes.forEach(size => {
			const jpegPath = path.join(destDir, name, name + '@' + size + '.jpg');
			const webpPath = path.join(destDir, name, name + '@' + size + '.webp');

			conversions.push(writeImage(srcImg, jpegPath, size, 'jpeg'));
			conversions.push(writeImage(srcImg, webpPath, size, 'webp'));
		});

		await Promise.all(conversions);

		process.send(srcImg);
	});
}

function writeImage(file, filePath, size, type) {
	return new Promise((resolve, reject) => {
		const transformer = sharp(file)
			.trim(3)
			.resize(size, null, { withoutEnlargement: true });
		if (type === 'jpeg') transformer.jpeg({ progressive: true });
		else transformer.webp();

		transformer.on('error', reject).toFile(filePath, (err, info) => {
			if (err) {
				console.error(err);
				reject(err);
			}
			resolve(info);``
		});
	});
}
