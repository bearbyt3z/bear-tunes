const fetch = require('node-fetch');
const jsdom = require('jsdom');
const fs = require('fs');
const request = require('request');

module.exports = {
    fetchWebPage: async url => {
        const response = await fetch(url)
            .then(response => response.text())
            .catch(error => console.error(error));
        return (new jsdom.JSDOM(response)).window.document;
    },

    arrayDifference: (array1, array2) => array1.filter(value => !array2.includes(value)),
    arrayIntersection: (array1, array2) => array1.filter(value => array2.includes(value)),

    arrayToLowerCase: array => array.map(value => (value.toLowerCase instanceof Function) ? value.toLowerCase() : value),

    downloadFile: (uri, filename, callback) => new Promise((resolve, reject) => {
        //request.head(uri, async (error, response, body) => {
        // console.log('content-type:', response.headers['content-type']);
        // console.log('content-length:', response.headers['content-length']);
        const uriSplit = uri.split('/');
        const uriFilename = uriSplit[uriSplit.length - 1];
        if (!filename || filename.length < 1) {
            filename = uriFilename;
        }
        else if (filename.split('.').length < 2) {  // no extension
            const uriFilenameSplit = uriFilename.split('.')
            const uriFilenameExtension = uriFilenameSplit[uriFilenameSplit.length - 1];
            filename = filename + uriFilenameExtension;
        }
        // request(uri).pipe(fs.createWriteStream(filename)).on('close', callback(filename));
        request(uri).pipe(fs.createWriteStream(filename))
            .on('close', () => {
                resolve(`File created successfully: ${filename}`);
                callback(filename);
            })
            .on('error', error => reject(error));
        // request(uri).pipe(fs.WriteSync(filename)).on('close', callback(filename));
    }),

    // replaceFilenameExtension: filename => filename.replace(/\.[^\\/.]+$/, ''),  // it's easier to use path module

    splitTrackNameToKeywords: name => {
        if (name instanceof Array) name = name.join(' ')
        name = name.trim();  // remove spaces at the beggining & end
        name = name.replace(/\s+[-–&]\s+|\s+/mgi, ' ');
        // name = name.replace(/[\(\)\[\],]|\.[\w\d]+?$/mgi, '');  // +? => non-greedy for file extension match  // don't work with: Lust 2.1.mp3
        name = name.replace(/[\(\)\[\],]|\.mp3$/mgi, '');  // +? => non-greedy for file extension match
        // console.log(name);
        return Array.from(new Set(name.split(' ')));  // set to avoid repetitions
        // return name.match(/\b([\w\d]+)\b/mgi);
    },

    createTitle: (titleNode, remixedNode) => {
        let title = titleNode.textContent.trim();
        if (title.match(/\bfeat\b/i)) {
            title = title.replace(/\bfeat\.? /i, 'feat. ');  // add missing dot after "feat" shortcut, and replace "Feat" with "feat"
            if (title.indexOf('(feat') < 0) {  // if "feat" isn't in parentheses add them
                title = title.replace(/\bfeat. /, '(feat. ') + ')';
            }
        }
        if (remixedNode) title = `${title} (${remixedNode.textContent.trim()})`;
        return title;
    },

    createArtistsList: (artistsNode, title = '') => {  // if title provided => remove featuring artists from artist list
        if (!artistsNode) return '';  // '' => delete frame if there is no artist information
        const artistsLinks = artistsNode.querySelectorAll('a');
        if (artistsLinks.length > 0) {
            return Array.from(artistsLinks).reduce((result, link) => {
                const artist = link.textContent.trim();
                if (title.search(new RegExp(`(feat|ft).+${module.exports.regExpEscape(artist)}`, 'i')) < 0)  // we have to search for feat/ft before artist name
                    result.push(artist);
                return result;
            }, []).join(', ');
        }
        return artistsNode.textContent.trim();
        // return (artistsLinks.length > 0) ? Array.from(artistsLinks).map(link => link.textContent.trim())).join(', ') : artistsNode.textContent.trim();
    },

    createKey: keyNode => keyNode.textContent.trim().replace('♭ ', 'b').replace('♯ ', '#').replace('maj', 'M').replace('min', 'm'),

    isString: value => typeof value === 'string' || value instanceof String,

    regExpEscape: (str) => String(str).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'),

    replacePathForbiddenChars: stringOrArray => {
        const replaceRegEx = /[\/\\\*\?\<\>|:"]/gm;
        if (module.exports.isString(stringOrArray)) return stringOrArray.replace(replaceRegEx, '-');
        if (stringOrArray.map instanceof Function) return stringOrArray.map(str => str.replace(replaceRegEx, '-'));
        return stringOrArray;  // in other case...
    },

    leaveOnlyFirstLine: text => text.replace(/\n.*/gmi, ''),

    getUrlFromFile: filePath => {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const urlIndex = fileContent.indexOf('URL=');
        if (!urlIndex) return null;
        return fileContent.substring(urlIndex + 4).split('\n')[0];
    },
};
