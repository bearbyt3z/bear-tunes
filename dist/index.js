// https://github.com/aadsm/JavaScript-ID3-Reader
// ID3 tags reader in JavaScript (ID3v1, ID3v2 and AAC) http://www.aadsm.net/libraries/id3/
// https://antimatter15.com/wp/2010/07/a-bright-coloured-fish-parsing-id3v2-tags-in-javascript-and-extensionfm/
// https://github.com/antimatter15/js-id3v2
// https://wiki.hydrogenaud.io/index.php?title=Tag_Mapping
// http://id3.org/id3v2.4.0-frames
// https://eyed3.readthedocs.io/en/latest/plugins/classic_plugin.html
// https://eyed3.readthedocs.io/en/latest/_modules/eyed3/id3/frames.html
// https://readthedocs.org/projects/eyed3/downloads/pdf/latest/
// display plugin of eyeD3 requires grako:
// $pip install grako
'use strict';
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
var __spreadArray = (this && this.__spreadArray) || function (to, from) {
    for (var i = 0, il = from.length, j = to.length; i < il; i++, j++)
        to[j] = from[i];
    return to;
};
Object.defineProperty(exports, "__esModule", { value: true });
var url = require("url");
var process = require("process");
var childProcess = require("child_process");
var fs = require("fs");
var path = require("path");
var tools = require('./tools');
var logger = require('./logger');
var DOMAIN_URL = 'https://www.beatport.com';
var SEARCH_URL = DOMAIN_URL + '/search/tracks?per-page=150&q='; // we want tracks only
// const SEARCH_URL = DOMAIN_URL + '/search/tracks?q=';  // we want tracks only
// const SEARCH_URL = DOMAIN_URL + '/search?q=';
var DISPLAY_PLUGIN_PATTERN_FILE = 'eyed3-pattern.txt';
var _a = require('winston'), createLogger = _a.createLogger, format = _a.format, transports = _a.transports;
var combine = format.combine, timestamp = format.timestamp, label = format.label, printf = format.printf;
var tracksDirectory = process.argv[2] || '.';
if (!fs.existsSync(tracksDirectory)) {
    // logger.silly(`Path specified doesn't exist: ${tracksDirectory}`);
    // logger.verbose(`Path specified doesn't exist: ${tracksDirectory}`);
    // logger.debug(`Path specified doesn't exist: ${tracksDirectory}`);
    // logger.info(`Path specified doesn't exist: ${tracksDirectory}`);
    // logger.warn(`Path specified doesn't exist: ${tracksDirectory}`);
    logger.error("Path specified doesn't exist: " + tracksDirectory);
    process.exitCode = 1;
    return;
    // process.exit(1);
}
if (!fs.statSync(tracksDirectory).isDirectory()) {
    logger.error("Path specified isn't a directory: " + tracksDirectory);
    process.exitCode = 2;
    return;
    // process.exit(2);
}
;
;
var processAllFilesInDirectory = function (directory) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        fs.readdir(directory, function (error, files) { return __awaiter(void 0, void 0, void 0, function () {
            var noFilesWereProcessed, _i, files_1, file, filePath;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        noFilesWereProcessed = true;
                        if (error) {
                            logger.error("Couldn't read directory: " + tracksDirectory);
                            process.exitCode = 3;
                            return [2 /*return*/];
                            // process.exit(3);
                        }
                        _i = 0, files_1 = files;
                        _a.label = 1;
                    case 1:
                        if (!(_i < files_1.length)) return [3 /*break*/, 4];
                        file = files_1[_i];
                        filePath = directory + path.sep + file;
                        if (fs.statSync(filePath).isDirectory()) {
                            processAllFilesInDirectory(filePath);
                            return [3 /*break*/, 3];
                        }
                        if (!(path.extname(file) === '.mp3')) return [3 /*break*/, 3];
                        noFilesWereProcessed = false;
                        return [4 /*yield*/, processTrack(filePath)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4:
                        if (noFilesWereProcessed) {
                            logger.error("There are no suitable files in directory: " + directory);
                            process.exitCode = 1;
                            return [2 /*return*/];
                        }
                        return [2 /*return*/];
                }
            });
        }); });
        return [2 /*return*/];
    });
}); };
var processTrack = function (trackPath) { return __awaiter(void 0, void 0, void 0, function () {
    var trackFilename, trackFilenameWithourExtension, trackFilenameKeywords, trackUrlFilename, trackUrl, bestMatchingTrack, trackData;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                trackFilename = path.basename(trackPath);
                trackFilenameWithourExtension = trackFilename.replace(new RegExp(path.extname(trackFilename) + "$"), '');
                trackFilenameKeywords = tools.splitTrackNameToKeywords(trackFilenameWithourExtension);
                console.log('########################################');
                logger.info("Filename [" + trackFilenameKeywords.length + "]: " + trackFilename);
                trackUrlFilename = path.join(path.dirname(trackPath), trackFilenameWithourExtension + ".url");
                if (!fs.existsSync(trackUrlFilename)) return [3 /*break*/, 1];
                trackUrl = tools.getUrlFromFile(trackUrlFilename);
                logger.info("Using URL: " + trackUrl);
                return [3 /*break*/, 3];
            case 1: return [4 /*yield*/, findBestMatchingTrack(trackFilenameKeywords)];
            case 2:
                bestMatchingTrack = _a.sent();
                if (bestMatchingTrack.score < Math.max(2, trackFilenameKeywords.length)) {
                    logger.warn("Couldn't match any track, the higgest score was " + bestMatchingTrack.score + " for track:\n" + bestMatchingTrack.fullname + "\nScore keywords: " + bestMatchingTrack.scoreKeywords + "\nName  keywords: " + trackFilenameKeywords);
                    return [2 /*return*/];
                }
                logger.info("Matched  [" + bestMatchingTrack.score + "]: " + bestMatchingTrack.fullname);
                trackUrl = bestMatchingTrack.url;
                _a.label = 3;
            case 3: return [4 /*yield*/, extractTrackData(trackUrl)];
            case 4:
                trackData = _a.sent();
                // await saveId3TagToFile(trackPath, trackData, { verbose: true });
                return [4 /*yield*/, saveId3TagToFile(trackPath, trackData)];
            case 5:
                // await saveId3TagToFile(trackPath, trackData, { verbose: true });
                _a.sent();
                return [2 /*return*/];
        }
    });
}); };
var extractId3Tag = function (trackPath) {
    var displayPluginOutput = childProcess.spawnSync('eyeD3', [
        '--plugin', 'display',
        '--pattern-file', DISPLAY_PLUGIN_PATTERN_FILE,
        trackPath
    ], {
        encoding: 'utf-8',
    });
    if (displayPluginOutput.stderr) {
        logger.warn("Cannot read ID3 tag of " + path.basename(trackPath) + ":\n" + tools.leaveOnlyFirstLine(displayPluginOutput.stderr)); // show only first line of error from plugin (ommit traceback)
        return {};
    }
    // console.log(displayPluginOutput.stdout);
    var id3TagJson;
    try {
        id3TagJson = JSON.parse(displayPluginOutput.stdout
            .replace(//mgi, '') // replace unicode characters that break parse() (e.g. Beatoprt's heart before links!)
            .replace(/,\s*\}/mgi, '}') // remove trailing commas that comes from plugin pattern (text-fields)
        );
    }
    catch (error) {
        logger.warn("Cannot parse ID3 tag output from display plugin: " + error);
        return {};
    }
    return id3TagJson;
};
var findBestMatchingTrack = function (inputKeywords) { return __awaiter(void 0, void 0, void 0, function () {
    var searchDoc, winner, trackNodes, _i, trackNodes_1, trackNode, trackTitle, trackArtists, trackRemixers, trackReleased, trackKeywords, keywordsIntersection, score;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, tools.fetchWebPage(SEARCH_URL + encodeURIComponent(inputKeywords.join('+')))];
            case 1:
                searchDoc = _a.sent();
                winner = {
                    score: -1,
                    released: '2999-12-12', // some far away date...
                };
                trackNodes = searchDoc.querySelectorAll('.bucket-item.ec-item.track');
                for (_i = 0, trackNodes_1 = trackNodes; _i < trackNodes_1.length; _i++) {
                    trackNode = trackNodes_1[_i];
                    trackTitle = tools.createTitle(trackNode.querySelector('.buk-track-primary-title'), trackNode.querySelector('.buk-track-remixed'));
                    trackArtists = tools.createArtistsList(trackNode.querySelector('.buk-track-artists'), trackTitle);
                    trackRemixers = tools.createArtistsList(trackNode.querySelector('.buk-track-remixers'));
                    trackReleased = trackNode.querySelector('.buk-track-released');
                    trackReleased = trackReleased && trackReleased.textContent;
                    trackKeywords = tools.splitTrackNameToKeywords([trackArtists, trackTitle]);
                    keywordsIntersection = tools.arrayIntersection(tools.arrayToLowerCase(inputKeywords), tools.replacePathForbiddenChars(tools.arrayToLowerCase(trackKeywords)));
                    score = keywordsIntersection.length;
                    if ((score > winner.score) || ((score === winner.score) && (Date.parse(trackReleased) < Date.parse(winner.released)))) {
                        winner = {
                            node: trackNode,
                            score: score,
                            scoreKeywords: keywordsIntersection,
                            released: trackReleased,
                            title: trackTitle,
                            artists: trackArtists,
                            remixers: trackRemixers,
                            url: DOMAIN_URL + trackNode.querySelector('.buk-track-title a[href*="/track/"]').href,
                        };
                        // if (score === inputKeywords.length) break;  // winner has been found (but maybe not the earier release!)
                    }
                }
                winner.fullname = winner.artists + " - " + winner.title;
                return [2 /*return*/, winner];
        }
    });
}); };
var extractTrackData = function (trackUrl) { return __awaiter(void 0, void 0, void 0, function () {
    var trackDoc, title, remixers, artists, released, year, bpm, key, genre, waveform, trackUrlPathnameArray, trackId, trackUfid, publisherUrl, publisher, albumUrl, album;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, tools.fetchWebPage(trackUrl)];
            case 1:
                trackDoc = _a.sent();
                title = tools.createTitle(trackDoc.querySelector('.interior-title h1:not(.remixed)'), trackDoc.querySelector('.interior-title h1.remixed'));
                remixers = tools.createArtistsList(trackDoc.querySelector('.interior-track-artists:nth-of-type(2) .value'));
                artists = tools.createArtistsList(trackDoc.querySelector('.interior-track-artists .value'), title);
                released = trackDoc.querySelector('.interior-track-content-item.interior-track-released .value').textContent.trim();
                year = released.split('-')[0];
                bpm = trackDoc.querySelector('.interior-track-content-item.interior-track-bpm .value').textContent.trim();
                key = tools.createKey(trackDoc.querySelector('.interior-track-content-item.interior-track-key .value'));
                genre = tools.createGenresList(trackDoc.querySelector('.interior-track-content-item.interior-track-genre'));
                waveform = trackDoc.querySelector('#react-track-waveform.interior-track-waveform[data-src]').dataset.src;
                trackUrlPathnameArray = url.parse(trackUrl, true).pathname.split('/');
                trackId = trackUrlPathnameArray[trackUrlPathnameArray.length - 1];
                trackUfid = "track-" + trackId;
                publisherUrl = DOMAIN_URL + trackDoc.querySelector('.interior-track-content-item.interior-track-labels .value a').href;
                return [4 /*yield*/, extractPublisherData(publisherUrl)];
            case 2:
                publisher = _a.sent();
                albumUrl = DOMAIN_URL + trackDoc.querySelector('.interior-track-release-artwork-link[href*="/release/"]').href;
                return [4 /*yield*/, extractAlbumData(albumUrl, trackId)];
            case 3:
                album = _a.sent();
                return [2 /*return*/, {
                        url: trackUrl,
                        artists: artists,
                        title: title,
                        remixers: remixers,
                        released: released,
                        year: year,
                        genre: genre,
                        bpm: bpm,
                        key: key,
                        ufid: trackUfid,
                        waveform: waveform,
                        publisher: publisher,
                        album: album,
                    }];
        }
    });
}); };
var extractAlbumData = function (albumUrl, trackId) { return __awaiter(void 0, void 0, void 0, function () {
    var albumDoc, artists, title, catalogNumber, trackNumber, trackTotal, artwork;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, tools.fetchWebPage(albumUrl)];
            case 1:
                albumDoc = _a.sent();
                artists = tools.createArtistsList(albumDoc.querySelector('.interior-release-chart-content .interior-release-chart-content-list .interior-release-chart-content-item .value'));
                title = albumDoc.querySelector('.interior-release-chart-content h1').textContent;
                catalogNumber = albumDoc.querySelector('.interior-release-chart-content-item--desktop .interior-release-chart-content-item:nth-of-type(3) .value').textContent;
                trackNumber = albumDoc.querySelector(".interior-release-chart-content .bucket-item.ec-item.track[data-ec-id=\"" + trackId + "\"] .buk-track-num").textContent;
                trackTotal = albumDoc.querySelectorAll('.interior-release-chart-content .bucket-item.ec-item.track').length;
                artwork = albumDoc.querySelector('.interior-release-chart-artwork-parent .interior-release-chart-artwork').src;
                return [2 /*return*/, {
                        artists: artists,
                        title: title,
                        catalogNumber: catalogNumber,
                        trackNumber: trackNumber,
                        trackTotal: trackTotal,
                        url: albumUrl,
                        artwork: artwork,
                    }];
        }
    });
}); };
var extractPublisherData = function (publisherUrl) { return __awaiter(void 0, void 0, void 0, function () {
    var publisherDoc, name, logotype;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, tools.fetchWebPage(publisherUrl)];
            case 1:
                publisherDoc = _a.sent();
                name = publisherDoc.querySelector('.interior-top-container .interior-title h1').textContent.trim();
                logotype = publisherDoc.querySelector('.interior-top-container .interior-top-artwork-parent img.interior-top-artwork').src;
                return [2 /*return*/, {
                        name: name,
                        url: publisherUrl,
                        logotype: logotype,
                    }];
        }
    });
}); };
;
var saveId3TagToFile = function (trackPath, trackData, _a) {
    var _b = _a === void 0 ? {} : _a, _c = _b.id3v2, id3v2 = _c === void 0 ? true : _c, _d = _b.id3v1, id3v1 = _d === void 0 ? true : _d, _e = _b.verbose, verbose = _e === void 0 ? false : _e;
    return __awaiter(void 0, void 0, void 0, function () {
        var imagePaths, trackFilename, colonEscapeChar, eyeD3Options, correctedFilename;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    imagePaths = {};
                    return [4 /*yield*/, tools.downloadFile(trackData.publisher.logotype, null, function (filename) {
                            if (verbose) {
                                console.log("Publisher logotype written to: " + filename);
                            }
                            imagePaths.publisherLogotype = filename;
                        })];
                case 1:
                    _f.sent();
                    return [4 /*yield*/, tools.downloadFile(trackData.album.artwork, null, function (filename) {
                            if (verbose) {
                                console.log("Album artwork written to: " + filename);
                            }
                            imagePaths.albumCover = filename;
                        })];
                case 2:
                    _f.sent();
                    return [4 /*yield*/, tools.downloadFile(trackData.waveform, null, function (filename) {
                            if (verbose) {
                                console.log("Waveform written to: " + filename);
                            }
                            imagePaths.waveform = filename;
                        })];
                case 3:
                    _f.sent();
                    trackFilename = path.basename(trackPath);
                    colonEscapeChar = '\\';
                    eyeD3Options = [
                        '--verbose',
                        '--artist', trackData.artists,
                        // '--artist', trackData.artists.replace('ø', 'o'),
                        '--title', trackData.title,
                        '--text-frame',
                        "TPE4:" + trackData.remixers,
                        '--album', trackData.album.title,
                        '--album-artist', trackData.album.artists,
                        '--text-frame',
                        "TRCK:" + trackData.album.trackNumber + "/" + trackData.album.trackTotal,
                        // '--track', trackData.album.trackNumber,
                        // '--track-total', trackData.album.trackTotal,
                        // '--no-zero-padding',  // there is no such option in eyeD3 anymore?
                        // '--disc-num', '???',  // there is no disc information on beatport? (and other streaming like Amazon?)
                        // '--disc-total', '???',
                        // '--release-year', trackData.year,
                        // '--text-frame', `TDRC:${trackData.year}`,
                        '--text-frame',
                        "TYER:" + trackData.year,
                        '--text-frame',
                        "TORY:" + trackData.released,
                        '--text-frame',
                        "TRDA:" + trackData.released,
                        '--text-frame',
                        "TDAT:" + trackData.released,
                        '--text-frame',
                        "TDRC:" + trackData.released,
                        '--text-frame',
                        "TDOR:" + trackData.released,
                        '--text-frame',
                        "TDRL:" + trackData.released,
                        // '--release-date', trackData.released,
                        // '--orig-release-date', trackData.released,
                        '--url-frame',
                        "WOAF:" + trackData.url.replace(':', colonEscapeChar + ":"),
                        '--url-frame',
                        "WPUB:" + trackData.publisher.url.replace(':', colonEscapeChar + ":"),
                        '--bpm', trackData.bpm,
                        '--text-frame',
                        "TKEY:" + trackData.key,
                        '--user-text-frame',
                        "INITIALKEY:" + trackData.key,
                        '--user-text-frame',
                        "CATALOGNUMBER:" + trackData.album.catalogNumber,
                        '--user-text-frame',
                        "CATALOG #:" + trackData.album.catalogNumber,
                        '--add-image',
                        imagePaths.albumCover + ":FRONT_COVER:Front Cover",
                        '--add-image',
                        imagePaths.waveform + ":BRIGHT_COLORED_FISH:Waveform",
                        '--add-image',
                        imagePaths.publisherLogotype + ":PUBLISHER_LOGO:Publisher Logotype",
                        '--genre', trackData.genre,
                        '--publisher', trackData.publisher.name, '--text-frame',
                        "TIT1:" + trackData.publisher.name,
                        // '--unique-file-id', `http${colonEscapeChar}://www.id3.org/dummy/ufid.html:${trackData.ufid}`,
                        '--unique-file-id',
                        DOMAIN_URL.replace(':', colonEscapeChar + ":") + ":" + trackData.ufid,
                        '--remove-frame', 'PRIV', '--remove-all-comments',
                        '--text-frame', 'TAUT:',
                        '--preserve-file-times',
                        trackPath
                    ];
                    if (id3v2) {
                        executeEyeD3Tool('2.4', eyeD3Options, trackFilename, verbose);
                    }
                    if (id3v1) {
                        executeEyeD3Tool('1.1', eyeD3Options, trackFilename, verbose);
                    }
                    correctedFilename = tools.replacePathForbiddenChars(trackData.artists + " - " + trackData.title + path.extname(trackPath));
                    fs.renameSync(trackPath, path.dirname(trackPath) + path.sep + correctedFilename);
                    console.log("File was renamed to: " + correctedFilename);
                    // fs.rename(trackPath, path.dirname(trackPath) + path.sep + correctedFilename, (error) => {
                    //   if (error) {
                    //     console.error(`Couldn't rename ${trackFilename}`);
                    //     return;
                    //   }
                    //   console.log(`File was renamed to: ${correctedFilename}`);
                    // });
                    fs.unlinkSync(imagePaths.albumCover);
                    fs.unlinkSync(imagePaths.waveform);
                    fs.unlinkSync(imagePaths.publisherLogotype);
                    return [2 /*return*/];
            }
        });
    });
};
var executeEyeD3Tool = function (version, options, filename, verbose) {
    if (verbose === void 0) { verbose = false; }
    if (!['1.0', '1.1', '2.3', '2.4'].includes(version)) {
        console.error("Wrong version of ID3 tag was specified: " + version);
        return -1;
    }
    var child = childProcess.spawnSync('eyeD3', __spreadArray([
        '--v2',
        "--to-v" + version
    ], options), {
        encoding: 'utf8',
    });
    if (child.error) {
        logger.error("ERROR: Failed to start child process: " + child.error);
    }
    else if (child.status !== 0) {
        logger.error("ERROR: Child process (v" + version + ") exited with code " + child.status + ":\n" + tools.leaveOnlyFirstLine(child.stderr));
        // } else if (child.stderr) {
        //   console.error(`Error occured when saving ID3v${version} tag:`);
    }
    else {
        console.log(verbose ? child.stdout : "ID3v" + version + " tag was saved to " + filename);
    }
};
processAllFilesInDirectory(tracksDirectory);
