"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUrlFromFile = exports.leaveOnlyFirstLine = exports.replacePathForbiddenChars = exports.isString = exports.regExpEscape = exports.createKey = exports.createGenresList = exports.createArtistsList = exports.createTitle = exports.splitTrackNameToKeywords = exports.downloadFile = exports.arrayToLowerCase = exports.arrayIntersection = exports.arrayDifference = exports.fetchWebPage = void 0;
var node_fetch_1 = require("node-fetch");
var jsdom = require("jsdom");
var fs = require("fs");
var request = require("request");
function fetchWebPage(url) {
    return __awaiter(this, void 0, void 0, function () {
        var response;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4, node_fetch_1.default(url)
                        .then(function (response) { return response.text(); })
                        .catch(function (error) { return console.error(error); })];
                case 1:
                    response = _a.sent();
                    return [2, (new jsdom.JSDOM(response)).window.document];
            }
        });
    });
}
exports.fetchWebPage = fetchWebPage;
function arrayDifference(array1, array2) {
    return array1.filter(function (value) { return !array2.includes(value); });
}
exports.arrayDifference = arrayDifference;
function arrayIntersection(array1, array2) {
    return array1.filter(function (value) { return array2.includes(value); });
}
exports.arrayIntersection = arrayIntersection;
function arrayToLowerCase(array) {
    return array.map(function (value) { return value.toLowerCase(); });
}
exports.arrayToLowerCase = arrayToLowerCase;
function downloadFile(uri, filename, callback) {
    return new Promise(function (resolve, reject) {
        var uriSplit = uri.split('/');
        var uriFilename = uriSplit[uriSplit.length - 1];
        if (!filename || filename.length < 1) {
            filename = uriFilename;
        }
        else if (filename.split('.').length < 2) {
            var uriFilenameSplit = uriFilename.split('.');
            var uriFilenameExtension = uriFilenameSplit[uriFilenameSplit.length - 1];
            filename = filename + uriFilenameExtension;
        }
        request(uri).pipe(fs.createWriteStream(filename))
            .on('close', function () {
            resolve("File created successfully: " + filename);
            callback(filename);
        })
            .on('error', function (error) {
            console.log(error);
            reject(error);
        });
    });
}
exports.downloadFile = downloadFile;
function splitTrackNameToKeywords(name) {
    if (name instanceof Array)
        name = name.join(' ');
    name = name.trim();
    name = name.replace(/\s+[-–&]\s+|\s+/mgi, ' ');
    name = name.replace(/[\(\)\[\],]|\.mp3$/mgi, '');
    return Array.from(new Set(name.split(' ')));
}
exports.splitTrackNameToKeywords = splitTrackNameToKeywords;
function createTitle(titleNode, remixedNode) {
    var title = titleNode.textContent.trim();
    if (title.match(/\bfeat\b/i)) {
        title = title.replace(/\bfeat\.? /i, 'feat. ');
        if (title.indexOf('(feat') < 0) {
            title = title.replace(/\bfeat. /, '(feat. ') + ')';
        }
    }
    if (remixedNode)
        title = title + " (" + remixedNode.textContent.trim() + ")";
    return title;
}
exports.createTitle = createTitle;
function createArtistsList(artistsNode, title) {
    if (title === void 0) { title = ''; }
    if (!artistsNode)
        return '';
    var artistsLinks = artistsNode.querySelectorAll('a');
    if (artistsLinks.length > 0) {
        return Array.from(artistsLinks).reduce(function (result, link) {
            var artist = link.textContent.trim();
            if (title.search(new RegExp("(feat|ft).+" + module.exports.regExpEscape(artist), 'i')) < 0)
                result.push(artist);
            return result;
        }, []).join(', ');
    }
    return artistsNode.textContent.trim();
}
exports.createArtistsList = createArtistsList;
function createGenresList(genresNode) {
    if (!genresNode)
        return '';
    var genresLinks = genresNode.querySelectorAll('a');
    if (genresLinks.length > 0) {
        return Array.from(genresLinks).reduce(function (result, link) {
            var genre = link.textContent.trim();
            var separator = result && (link.href.indexOf('sub-genre') >= 0 ? ': ' : ', ');
            return result + separator + genre;
        }, '');
    }
    return genresNode.textContent.trim();
}
exports.createGenresList = createGenresList;
function createKey(keyNode) {
    return keyNode.textContent.trim().replace('♭ ', 'b').replace('♯ ', '#').replace('maj', 'M').replace('min', 'm');
}
exports.createKey = createKey;
function regExpEscape(str) {
    return String(str).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}
exports.regExpEscape = regExpEscape;
function isString(value) {
    return typeof value === 'string' || value instanceof String;
}
exports.isString = isString;
var replaceRegEx = /[\/\\\*\?\<\>|:"]/gm;
function replacePathForbiddenChars(stringOrArray) {
    if (isString(stringOrArray))
        return stringOrArray.replace(replaceRegEx, '-');
    return stringOrArray.map(function (str) { return str.replace(replaceRegEx, '-'); });
}
exports.replacePathForbiddenChars = replacePathForbiddenChars;
function leaveOnlyFirstLine(text) {
    return text.replace(/\n.*/gmi, '');
}
exports.leaveOnlyFirstLine = leaveOnlyFirstLine;
function getUrlFromFile(filePath) {
    var fileContent = fs.readFileSync(filePath, 'utf8');
    var urlIndex = fileContent.indexOf('URL=');
    if (!urlIndex)
        return null;
    return fileContent.substring(urlIndex + 4).split('\n')[0];
}
exports.getUrlFromFile = getUrlFromFile;
