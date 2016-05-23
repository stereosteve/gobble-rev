const crypto = require('crypto');
const minimatch = require('minimatch');
const path = require('path');
const mapSeries = require('promise-map-series');
const sander = require('sander');

const matchesPatterns = (patterns, filename) =>
	patterns.some(pattern => minimatch(filename, pattern))


// findPaths :: [string] => string => [string]
// Returns the list of `paths` found inside `content`
const findPaths = paths => content =>
	paths.filter(path => content.includes(path));

// findDeps :: (string, string, [string], [string]) => string => [string]
// Return the list of dependencies for a given filename, if the
// given filename matches the skip list, then the empty list is
// returned.
const findDeps = (basedir, filenames, skip, filter) => filename => {
	return matchesPatterns(skip, filename)
		? []
		: sander
			.readFile(basedir, filename)
			.then(findPaths(filenames))
			.then(deps =>
				deps.filter(dep => (dep !== filename) && !(matchesPatterns(filter, dep))));
};

// buildDepsMap :: (string, string, [string], [string]) => Promise Map(string, [string])
const buildDepsMap = (basedir, filenames, skip, filter) =>
	Promise.all(filenames.map(findDeps(basedir, filenames, skip, filter))).then(allDeps =>
		allDeps.reduce((map, deps, i) => map.set(filenames[i], deps), new Map()));

// toposort :: Map(string, [string]) => [string]
// Run a topological sort on the dependency map, returning a
// list of filenames that can be processed in order
const toposort = function (map) {
	const graph = [];
	const standalone = [];
	for (let [filename, deps] of map.entries()) {
		if (deps.length > 0) {
			deps.forEach(dep => graph.push([filename, dep]));
		} else {
			standalone.push(filename);
		}
	}
	return standalone.concat(require('toposort')(graph).reverse());
};

const hash = (algo, data) =>
	crypto.createHash(algo).update(data).digest('hex');

const transformFilename = (filename, hash) => {
	const ext = path.extname(filename);
	return `${path.basename(filename, ext)}.${hash.substr(0, 8)}${ext}`;
};

const replace = (inputdir, outputdir, filename, replacements, skipRename) =>
	sander.readFile(inputdir, filename).then(content => {
		if (replacements.size > 0) {
			content = content.toString('utf8');
			replacements.forEach((r, s) => {
				content = content.replace(new RegExp(s, 'g'), r);
			});
		}

		const sha = hash('sha256', content);
		const newFilename = matchesPatterns(skipRename, filename)
			? filename
			: path.join(path.dirname(filename), transformFilename(path.basename(filename), sha));

		return sander.writeFile(outputdir, newFilename, content).then(() => newFilename);
	});


module.exports = function rev(inputdir, outputdir, options) {
	const skipRename = options.skipRename || ['index.html'];
	const skipFindDeps = options.skipFindDeps || ['*.png', '*.jpg', '*.jpeg', '*.gif'];
	var manifest = {};

	return sander.lsr(inputdir).then(filenames =>
		buildDepsMap(inputdir, filenames, skipFindDeps, skipRename).then(allDeps => {
			const refs = new Map();

			return mapSeries(toposort(allDeps), filename => {
				const deps = allDeps.get(filename);
				const replacements = new Map(deps.map(dep => [dep, refs.get(dep)]));
				return replace(inputdir, outputdir, filename, replacements, skipRename).then(newFilename => {
					refs.set(filename, newFilename);
					manifest[filename] = newFilename;
					return newFilename;
				});
			});
		}))
		.then(function() {
			return sander.writeFile(outputdir, "manifest.json", JSON.stringify(manifest, undefined, 2));
		});
};
