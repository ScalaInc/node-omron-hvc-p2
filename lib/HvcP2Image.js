/* ------------------------------------------------------------------
* node-omron-hvc-p2 - HvcP2Image.js
* Date: 2018-02-27
* ---------------------------------------------------------------- */
'use strict';
const mFs = require('fs');
const svg = require("svg");

const mypath = process.cwd();

// Defacto for linux/os x - stop by Punk Ave and give Tom Boutell a cookie next time I'm in Center City Philly ;)
let mGd = null;
try {
	mGd = require('node-gd');
} catch(e) {}

// LWIP - not the best performance, not well maintained, hard to compile without a lot of hassle
let mLwip = null;
try {
	mLwip = require('lwip');
} catch(e) {}

// Jimp - added in because of issues with lwip not being maintained/out of date - hard to get compiled on soms sytems
let Jimp = null;
try {
	Jimp = require("jimp");
} catch(e) {}

// Preferred dependency - sharp - reasons: Way faster than lwip and jimp, at leat as fast if not faster than node-gd, SVG support and most importantly compiles across multiple platforms/currently maintained
let sharp = null;
try {
	sharp = require("sharp");
} catch(e) {}

// What are we using?

// TODO Add in support in config to control this manually - otherwise leverage in this order: sharp,node-gd,lwip,jimp

console.log("Image Libraries available: node-gd: " + !!mGd + " | sharp: "+ !!sharp +" | lwip: " + !!mLwip + " | jimp: "+ !!Jimp);

if(sharp) {
		console.log("Using: sharp");
		
		const simd = sharp.simd(true);
		/*
			console.log(simd)
		const threads = sharp.concurrency();
			console.log(threads);
		const sharpCache = sharp.cache();
			console.log(sharpCache);
			*/
} else if(mGd) {
	console.log("Using: node-gd");
} else if(mLwip) {
	console.log("Using: lwip");
} else if(Jimp) {
	console.log("Using: jimp");
} else {
	console.log("Using: nothing - oops! Need at least one of the above for image processing!")
}

/* ------------------------------------------------------------------
* Constructor: HvcP2Image()
* ---------------------------------------------------------------- */
const HvcP2Image = function() {
	// Public properties

	// Private properties
	this._IMAGE_OPTIONS = {
		png: {
			compression  : 'fast',
			interlaced   : false,
			transparency : 'auto'
		},
		jpg: {
			quality : 100
		},
		gif: {
			colors     : 256,
			interlaced : false,
			threshold  : 0
		}
	};
};

/* ------------------------------------------------------------------
* Method: conv(params, result)
* -params:
*   - width  | required    | Number  | Width of image
*   - height | required    | Number  | Height of image
*   - pixels | required    | Array   | 
*   - type   | required    | Number  | 1: Buffer, 2: Data URL, 3: File
*   - format | optional    | String  | "gif" (default), "jpg", or "png"
*   - path   | conditional | String  | File path with file name (e.g., "/tmp/image.png")
*   - marker | optional   | Boolean | true or false (default)
* ---------------------------------------------------------------- */
HvcP2Image.prototype.conv = function(params, result) {
	let promise = new Promise((resolve, reject) => {
		if(!mGd && !mLwip && !Jimp && !sharp) {
			reject(new Error('At least one of the node modules `node-gd` or (Linux/MacOS), `jimp`(Linux/MacOS/Windows), `sharp`(Linux/MacOS/Windows) - coming soon, or `lwip` (Windows) must be installed.'));
			return;
		}

		let p = {};
		
		// width
		if('width' in params) {
			let v = params['width'];
			if(typeof(v) === 'number' && v % 1 === 0 && v > 0) {
				p['width'] = v;
			} else {
				reject(new Error('The parameter `width` must be an integer grater than 0.'));
				return;
			}
		} else {
			reject(new Error('The parameter `width` is required.'));
			return;
		}

		// height
		if('height' in params) {
			let v = params['height'];
			if(typeof(v) === 'number' && v % 1 === 0 && v > 0) {
				p['height'] = v;
			} else {
				reject(new Error('The parameter `height` must be an integer grater than 0.'));
				return;
			}
		} else {
			reject(new Error('The parameter `height` is required.'));
			return;
		}
		
		// buffer
		if('buffer' in params) {
			let v = params['buffer']
			if(Buffer.isBuffer(v) && v.length > 0) {
				p['buffer'] = v;
			} else {
				reject(new Error('The parameter `buffer` must be an Buffer object.'));
				return;
			}
		} else {
			reject(new Error('The parameter `buffer` is required.'));
			return;
		}
		
		
		// pixels - we could optimize and skip this and the pixel creation in command - do that!
		if('pixels' in params) {
			let v = params['pixels']
			if(Array.isArray(v) && v.length > 0) {
				p['pixels'] = v;
			} else {
				reject(new Error('The parameter `pixels` must be an Array object.'));
				return;
			}
		} else {
			reject(new Error('The parameter `pixels` is required.'));
			return;
		}

		// type
		if('type' in params) {
			let v = params['type'];
			if(typeof(v) === 'number' && v.toString().match(/^(1|2|3)$/)) {
				p['type'] = v;
			} else {
				reject(new Error('The parameter `type` must be 1, 2, or 3.'));
				return;
			}
		} else {
			reject(new Error('The parameter `type` is required.'));
			return;
		}

		// format (reivist for support diffs between node-gd, lwip, jim, sharp)
		if('format' in params) {
			let v = params['format'];
			if(typeof(v) === 'string' && v.match(/^(gif|jpg|png)$/)) {
				p['format'] = v;
			} else {
				reject(new Error('The parameter `format` must be "gif", "jpg", or "png".'));
				return;
			}
		} else {
			p['format'] = 'gif';
		}

		// path
		if(p['type'] === 3) {
			if('path' in params) {
				let v = params['path'];
				if(typeof(v) === 'string' && v !== '') {
					p['path'] = v;
				} else {
					reject(new Error('The parameter `path` is invalid.'));
					return;
				}
			} else {
				reject(new Error('The parameter `path` is required.'));
				return;
			}
		}

		// marker
		if('marker' in params) {
			let v = params['marker'];
			if(typeof(v) === 'boolean') {
				p['marker'] = v;
			} else {
				reject(new Error('The parameter `marker` must be Boolean.'));
				return;
			}
		} else {
			p['marker'] = false;
		}

		// Re-ordered this - to allow fall through order based on performance, first sharp, then gd, then lwip, then jimp... based on perf numbers found here:
		// http://sharp.pixelplumbing.com/en/stable/performance/
		
		if(sharp) {
			this._convArrayToImageSharp(p, result).then((result) => {
				resolve(result);
			}).catch((error) => {
				reject(error);
			});	
		} else if(mGd) {
			this._convArrayToImageGd(p, result).then((result) => {
				resolve(result);
			}).catch((error) => {
				reject(error);
			});
		} else if(mLwip) {
			this._convArrayToImageLwip(p, result).then((result) => {
				resolve(result);
			}).catch((error) => {
				reject(error);
			});
		} else if(Jimp) {
			this._convArrayToImageJimp(p, result).then((result) => {
				resolve(result);
			}).catch((error) => {
				reject(error);
			});
		} else {
			reject(new Error('At least one of the OS appropriate node modules `node-gd`, `sharp`, `lwip`, or `jimp` must be installed.'));
			return;
		}
		
			//delete p["buffer"];
			//delete p["pixels"];	
		
	});
	
	delete params["pixels"];
	delete params["buffer"];
	
	return promise;
};

// node-gd
HvcP2Image.prototype._convArrayToImageGd = function(p, result) {
	
	let promise = new Promise((resolve, reject) => {
		mGd.createTrueColor(p['width'], p['height'], (error, image) => {
			let left = 0;
			let top = 0;
			let index = 0;
			p['pixels'].forEach((v, i) => {
				let color = mGd.trueColor(v, v, v);
				image.setPixel(left, top, color)
				left ++;
				if(left >= p['width']) {
					left = 0;
					top ++;
				}
			});

			if(p['marker'] === true) {
				let w = 1600;
				let h = 1200;
				if(p['width'] < p['height']) {
					w = 1200;
					h = 1600;
				}
				if('hand' in result) {
					result['hand'].forEach((o) => {
						let x = o['x'];
						let y = o['y'];
						let s = o['size'];
						let sh = s / 2;
						let color = 0xffff00;
						image.rectangle(
							Math.round(p['width'] * (x - sh) / w),
							Math.round(p['height'] * (y - sh) / h),
							Math.round(p['width'] * (x + sh) / w),
							Math.round(p['height'] * (y + sh) / h),
							color
						);
					});
				}
				if('body' in result) {
					result['body'].forEach((o) => {
						let x = o['x'];
						let y = o['y'];
						let s = o['size'];
						let sh = s / 2;
						let color = 0x00ff00;
						image.rectangle(
							Math.round(p['width'] * (x - sh) / w),
							Math.round(p['height'] * (y - sh) / h),
							Math.round(p['width'] * (x + sh) / w),
							Math.round(p['height'] * (y + sh) / h),
							color
						);
					});
				}
				
				if('face' in result) {
					result['face'].forEach((o) => {
						if('face' in o) {
							let x = o['face']['x'];
							let y = o['face']['y'];
							let s = o['face']['size'];
							let sh = s / 2;
							let color = 0x00ff00;
							if('gender' in o) {
								if(o['gender']['gender'] === 1) {
									color = 0x0000ff;
								} else if(o['gender']['gender'] === 0) {
									color = 0xff0000;
								}
							}
							let x1 = Math.round(p['width'] * (x - sh) / w);
							let y1 = Math.round(p['height'] * (y - sh) / h);
							let x2 = Math.round(p['width'] * (x + sh) / w);
							let y2 = Math.round(p['height'] * (y + sh) / h);
							image.rectangle(x1, y1, x2, y2, color);
							if('age' in o) {
								let string = 'Age:' + o['age']['age'].toString();
								let font = mypath+"/fonts/FreeMono.ttf";
								if(mFs.existsSync(font)) {
									image.stringFT(color, font, 12, 0, x1, y1-4, string, false);
								}
							}
						}
					});
				}
			}

			let fpath = mypath+ "/data/image.";;
			if(p['type'] === 3) {
				fpath = p['path'];
			}
			let saveFile = null;
			if(p['format'] === 'gif') {
				saveFile = (cb) => {
					image.saveGif(fpath+p['format'], (error) => {
						cb(error);
					});
				};
			} else if(p['format'] === 'jpg') {
				saveFile = (cb) => {
					let q = this._IMAGE_OPTIONS['jpg']['quality'];
					image.saveJpeg(fpath+p['format'] , q, (error) => {
						cb(error);
					});
				};
			} else if(p['format'] === 'png') {
				saveFile = (cb) => {
					image.savePng(fpath+p['format'], 3, (error) => {
						cb(error);
					});
				};
			}
			saveFile((error) => {
				image.destroy();
				if(error) {
					reject(error);
					return;
				}
				if(p['type'] === 1 || p['type'] === 2) {
					mFs.open(fpath+p['format'] , 'r', (error, fd) => {
						if(error) {
							reject(error);
							return;
						}
						mFs.fstat(fd, (error, stats) => {
							let fsize = stats['size'];
							let buf = Buffer.alloc(fsize);
							mFs.read(fd, buf, 0, fsize, 0, (error, bytes, buffer) => {
								mFs.close(fd, () => {
									if(error) {
										reject(error);
										return;
									}
									if(p['type'] === 1) {
										resolve(buffer);
									} else if(p['type'] === 2) {
										resolve('data:image/' + p['format'] + ';base64,' + buffer.toString('base64'));
									}
								});
							});
						});
					});
				} else {
					resolve();
				}
			});
		});
	});
	return promise;
};


// Sharp stuff - preferred method - faster than lwip, jimp and unlike node-gd, compiles across platforms easily
// Getting a memory leak when using this - dammit
HvcP2Image.prototype._convArrayToImageSharp = function SharpImageConvert(p, result) {
	
	let promise = new Promise((resolve, reject) => {
			
		let svgText = "";
		
		//const sharpCache = sharp.cache();
		//console.log(sharpCache);
		sharp.cache({memory: 65});			
		sharp.concurrency(1);
			
		let fpath = mypath+ "/data/image.";;
		let saveFile = null;
		
		// buffer the data
		sharp(p['buffer'], { "density":72, raw: { width: p['width'], height: p['height'], channels: 1} })
		.on('error', err => console.log(`${err.message} from sharp`))
		.png({"compressionLevel":9}).on('error', err => console.log(`${err.message} from sharp`))
		.toBuffer(function bufferingImage(err, data) { 	
		
			if(err) {
				console.log(err);
					reject(err);
						return;
			} else {
	
		
			// markers, etc. do them here...
			if(p['marker'] === true) {
				let w = 1600;
				let h = 1200;
				if(p['width'] < p['height']) {
					w = 1200;
					h = 1600;
				}
				svgText =  '<svg width="320" height="240">';
				svgText += '<rect fill="rgba(0,0,0,0)"  x="0" y="0" width="320" height="240"/>';
			
				if('hand' in result) {
					result['hand'].forEach((o) => {
						let x = o['x'];
						let y = o['y'];
						let s = o['size'];
						let sh = s / 2;
						let color = "255,255,0,1";
					
						let x1 = Math.round(p['width'] * (x - sh) / w);
						let y1 = Math.round(p['height'] * (y - sh) / h);
						let x2 = Math.round(p['width'] * (x + sh) / w);
						let y2 = Math.round(p['height'] * (y + sh) / h);
					
						svgText += '<rect fill="rgba(0,0,0,0)" stroke-width="1" stroke="rgba('+color+')" x="'+x1+'" y="'+y1+'" width="'+(x2-x1)+'" height="'+(y2-y1)+'" rx="0" ry="0"/>';							

					});
				}
			
				if('body' in result) {
					result['body'].forEach((o) => {
						let x = o['x'];
						let y = o['y'];
						let s = o['size'];
						let sh = s / 2;
						// purple for bodies
						let color = "102,51,153,1";
					
						let x1 = Math.round(p['width'] * (x - sh) / w);
						let y1 = Math.round(p['height'] * (y - sh) / h);
						let x2 = Math.round(p['width'] * (x + sh) / w);
						let y2 = Math.round(p['height'] * (y + sh) / h);
					
						svgText += '<rect fill="rgba(0,0,0,0)" stroke-width="1" stroke="rgba('+color+')" x="'+x1+'" y="'+y1+'" width="'+(x2-x1)+'" height="'+(y2-y1)+'" rx="0" ry="0"/>';		
					
					});
				}
			
				if('face' in result) {
					result['face'].forEach((o) => {
						if('face' in o) {
							let x = o['face']['x'];
							let y = o['face']['y'];
							let s = o['face']['size'];
							let sh = s / 2;
							let color = "0,255,0,1";
							if('gender' in o) {
								if(o['gender']['gender'] === 1) {
									//color = 0x0000ff;
									color = "0,0,255,1";
								} else if(o['gender']['gender'] === 0) {
									//color = 0xff0000;
									color = "255,20,147,1";
								}
							}

							let x1 = Math.round(p['width'] * (x - sh) / w);
							let y1 = Math.round(p['height'] * (y - sh) / h);
						
							let x2 = Math.round(p['width'] * (x + sh) / w);
							let y2 = Math.round(p['height'] * (y + sh) / h);
						
							// Compose the SVG text 
							svgText += '<rect fill="rgba(0,0,0,0)" stroke-width="1" stroke="rgba('+color+')" x="'+x1+'" y="'+y1+'" width="'+(x2-x1)+'" height="'+(y2-y1)+'" rx="0" ry="0"/>';							
													
							if('age' in o) {
								let string = 'Age:' + o['age']['age'].toString();
								svgText += '<text x="'+x1+'" font-family="Verdana,Tahoma, Arial, sans-serif" y="'+(y1-4)+'" font-size="12" fill="rgba('+color+')">'+string+'</text>';
							}
						
						
						}

					// end of faces loop	
					});
				}
														
			} 
		
			if(p['marker'] === true) {
						
				// close the SVG, composite/overlay it on image and write to file...
				svgText += '</svg>'; 

				let svgBuffer = Buffer.from(svgText);
				// console.log(svgBuffer.length);
				// console.log(svgText.length);
				sharp(data)
				.on('error', err => console.log(`${err.message} from sharp`))
				.overlayWith( svgBuffer, {"density":72, width: 320, height: 240} )
				.on('error', err => console.log(`${err.message} from sharp`))
				.png({"compressionLevel":9}).on('error', err => console.log(`${err.message} from sharp`))
				//	.resize(320,240)
				.toFile(fpath+p['format'], function(err, info){
					svgBuffer = null;
					if(err) {
							console.log(err);
							reject(err);
							return;
						}
				})
				.on('error', err => console.log(`${err.message} from sharp`));
					
			} else {
				svgText = null;
				// write the image buffer without markers
				sharp(data)
				.on('error', err => console.log(`${err.message} from sharp`))
				.png({"compressionLevel":9}).on('error', err => console.log(`${err.message} from sharp`))
				.toFile(fpath+p['format'], function (err, info) { 	
					if(err) {
						console.log(err);
						reject(err);
						return;
					}
				})
				.on('error', err => console.log(`${err.message} from sharp`));
				
			}
			
			//console.log(sharp.cache());
			sharp.cache( { items: 0, files: 0} );
			data = null;
		
			if(p['type'] === 1 || p['type'] === 2) {
				mFs.open(fpath+p['format'] , 'r', (error, fd) => {
					if(error) {
						reject(error);
						return;
					}
					mFs.fstat(fd, (error, stats) => {
						let fsize = stats['size'];
						let buf = Buffer.alloc(fsize);
						mFs.read(fd, buf, 0, fsize, 0, (error, bytes, buffer) => {
							mFs.close(fd, () => {
								if(error) {
									reject(error);
									return;
								}
								if(p['type'] === 1) {
									resolve(buffer);
								} else if(p['type'] === 2) {
									resolve('data:image/' + p['format'] + ';base64,' + buffer.toString('base64'));
								}
							});
						});
						
					});
				});
			} else {
				resolve();
			}
		
			};		
		
		//console.log(sharp.counters());
		// end sharp image buffer
		})
		.on('error', err => console.log(`${err.message} from sharp`));
		
	
	});
	return promise;

}


// Jimp stuff - no markers or text yet - coming next
HvcP2Image.prototype._convArrayToImageJimp = function(p, result) {
		
	let promise = new Promise((resolve, reject) => {
	
		let _this = this;
	
		let image = new Jimp(p['width'], p['height'], function (error, image) {
		//console.log(error);
			let left = 0;
			let top = 0;
			let index = 0;
			
			p['pixels'].forEach((v, i) => {
				// set the color to an integer with a fixed alpha of solid via JIMP
				let color = Jimp.rgbaToInt(v, v, v, 255);
				image.setPixelColor(color, left, top);
				left ++;
				if(left >= p['width']) {
					left = 0;
					top ++;
				}
			});

		
			// markers, etc. do them here...
			/* REVISIT MARKERS!
			if(p['marker'] === true) {
				let w = 1600;
				let h = 1200;
				if(p['width'] < p['height']) {
					w = 1200;
					h = 1600;
				}
				if('hand' in result) {
					result['hand'].forEach((o) => {
						let x = o['x'];
						let y = o['y'];
						let s = o['size'];
						let sh = s / 2;
						let color = 0xffff00;
						image.rectangle(
							Math.round(p['width'] * (x - sh) / w),
							Math.round(p['height'] * (y - sh) / h),
							Math.round(p['width'] * (x + sh) / w),
							Math.round(p['height'] * (y + sh) / h),
							color
						);
					});
				}
				if('body' in result) {
					result['body'].forEach((o) => {
						let x = o['x'];
						let y = o['y'];
						let s = o['size'];
						let sh = s / 2;
						let color = 0x00ff00;
						image.rectangle(
							Math.round(p['width'] * (x - sh) / w),
							Math.round(p['height'] * (y - sh) / h),
							Math.round(p['width'] * (x + sh) / w),
							Math.round(p['height'] * (y + sh) / h),
							color
						);
					});
				}
				
				if('face' in result) {
					result['face'].forEach((o) => {
						if('face' in o) {
							let x = o['face']['x'];
							let y = o['face']['y'];
							let s = o['face']['size'];
							let sh = s / 2;
							let color = 0x00ff00;
							if('gender' in o) {
								if(o['gender']['gender'] === 1) {
									color = 0x0000ff;
								} else if(o['gender']['gender'] === 0) {
									color = 0xff0000;
								}
							}
							let x1 = Math.round(p['width'] * (x - sh) / w);
							let y1 = Math.round(p['height'] * (y - sh) / h);
							let x2 = Math.round(p['width'] * (x + sh) / w);
							let y2 = Math.round(p['height'] * (y + sh) / h);
							image.rectangle(x1, y1, x2, y2, color);
							if('age' in o) {
								let string = 'Age:' + o['age']['age'].toString();
								let font = mypath+"/fonts/FreeMono.ttf";
								if(mFs.existsSync(font)) {
									image.stringFT(color, font, 12, 0, x1, y1-4, string, false);
								}
							}
						}
					});
				}
			}
			*/
			
			
			//require('path').dirname(require.main.filename)
			
			let fpath = mypath+ "/data/image.";;
			if(p['type'] === 3) {
				fpath = p['path'];
			}
			let saveFile = null;
			// no GIF with Jimp - but there is bmp
			if(p['format'] === 'bmp') {
				saveFile = (cb) => {
					image.write(fpath+p['format'], (error) => {
						cb(error);
					});
				};
			} else if(p['format'] === 'jpg') {
			
				//console.log(p);
			
				saveFile = (cb) => {
										
					let q = _this._IMAGE_OPTIONS['jpg']['quality'];
					image.quality(q);
					image.write(fpath+p['format'], (error) => {
						cb(error);
					});
				};
			} else if(p['format'] === 'png') {
				saveFile = (cb) => {
					// Add in the png options like deflatelevel, deflateStrategy, etc
					image.write(fpath+p['format'], (error) => {
						cb(error);
					});
				};
			}
			
			saveFile((error) => {
				
				// how do we destroy image with jimp?
				//console.log(image);
				//image.destroy();
				
				if(error) {
					reject(error);
					return;
				}
				
				if(p['type'] === 1 || p['type'] === 2) {
					mFs.open(fpath+p['format'] , 'r', (error, fd) => {
						if(error) {
							reject(error);
							return;
						}
						mFs.fstat(fd, (error, stats) => {
							let fsize = stats['size'];
							let buf = Buffer.alloc(fsize);
							mFs.read(fd, buf, 0, fsize, 0, (error, bytes, buffer) => {
								mFs.close(fd, () => {
									if(error) {
										reject(error);
										return;
									}
									if(p['type'] === 1) {
										resolve(buffer);
									} else if(p['type'] === 2) {
										resolve('data:image/' + p['format'] + ';base64,' + buffer.toString('base64'));
									}
								});
							});
						});
					});
				} else {
					resolve();
				}
			});
		});
	
	});
	
	return promise;
};

// x, y, w, h - in progress for jimp markers - do we even need if we focus on sharp or other methods?
HvcP2Image.prototype._convArrayToImageJimpMarkerRectangle = function(image, x1, y1, x2, y2, color) {
	
	const canvas = new Jimp(512, 256, 0xFFFFFFFF);
/*
	// Promise-based wrapper for Jimp#getBuffer
	function encode(image) {
		return new Promise((fulfill, reject) => {
			canvas.getBuffer(Jimp.MIME_PNG, (err, img) => err ? reject(err) : fulfill(img));
		});
	}

	function makeIteratorThatFillsWithColor(color) {
	  return function (x, y, offset) {
		this.bitmap.data.writeUInt32BE(color, offset, true);
	  }
	};

	// fill
	canvas.scan(32, 32, 256, 128, makeIteratorThatFillsWithColor(0x00000040));

	// border
	const fillCrimson = makeIteratorThatFillsWithColor(0xED143DFF);
	canvas.scan(236      , 100      , 240, 1, fillCrimson);
	canvas.scan(236      , 100 + 110, 240, 1, fillCrimson);
	canvas.scan(236      , 100      , 1  , 110, fillCrimson);
	canvas.scan(236 + 240, 100      , 1  , 110, fillCrimson);

	// displaying
	//await encode(canvas);
	encode(canvas);
	
	return promise();
	
	*/

}

// LWIP - deprecate at some point - poor performance from lwip and jimp - prefer node-gd and sharp
HvcP2Image.prototype._convArrayToImageLwip = function(p, result) {
	let promise = new Promise((resolve, reject) => {
		mLwip.create(p['width'], p['height'], {r: 0, g: 0, b: 0, a: 0}, (error, image) => {
			if(error) {
				reject(error);
				return;
			}
			let left = 0;
			let top = 0;
			let index = 0;
			let setPixel = (cb) => {
				let g = p['pixels'][index];
				index ++;
				image.setPixel(left, top, [g, g, g, 100], (e, img) => {
					image = img;
					left ++;
					if(left >= p['width']) {
						left = 0;
						top ++;
					}
					if(top >= p['height']) {
						if(p['marker'] === true) {
							this._convArrayToImageLwipMarkers(image, p, result, () => {
								cb();
							});
						} else {
							cb();
						}
					} else {
						setPixel(cb);
					}
				});
			};
			setPixel(() => {
				if(p['type'] === 1 || p['type'] === 2) {
					image.toBuffer(p['format'], this._IMAGE_OPTIONS[p['format']], (error, buf) => {
						if(error) {
							reject(error);
						} else {
							if(p['type'] === 1) {
								resolve(buf);
							} else if(p['type'] === 2) {
								resolve('data:image/' + p['format'] + ';base64,' + buf.toString('base64'));
							}
						}
					});
				} else if(p['type'] === 3) {
					image.writeFile(p['path'], p['format'], this._IMAGE_OPTIONS[p['format']], (error, buf) => {
						if(error) {
							reject(error);
						} else {
							resolve();
						}
					});
				}
			});
		});
	});
	return promise;
};

HvcP2Image.prototype._convArrayToImageLwipMarkers = function(image, p, result, cb) {
	let w = 1600;
	let h = 1200;
	if(p['width'] < p['height']) {
		w = 1200;
		h = 1600;
	}
	this._convArrayToImageLwipMarkerFace(image, p, result, w, h).then(() => {
		return this._convArrayToImageLwipMarkerHand(image, p, result, w, h);
	}).then(() => {
		return this._convArrayToImageLwipMarkerBody(image, p, result, w, h);
	}).then(() => {
		cb();
	}).catch((error) => {
		throw error;
	});
};

HvcP2Image.prototype._convArrayToImageLwipMarkerFace = function(image, p, result, w, h) {
	let promise = new Promise((resolve, reject) => {
		if(!('face' in result)) {
			resolve();
			return;
		}
		let rect_num = result['face'].length;
		let rect_idx = 0;
		let drawRectangle = (cb) => {
			if(rect_idx === rect_num) {
				cb();
				return;
			}
			let o = result['face'][rect_idx];
			let x = o['face']['x'];
			let y = o['face']['y'];
			let s = o['face']['size'];
			let sh = s / 2;
			let color = [0, 255, 0, 100];
			if('gender' in o) {
				if(o['gender']['gender'] === 1) {
					color = [0, 0, 255, 100];
				} else if(o['gender']['gender'] === 0) {
					color = [255, 0, 0, 100];
				}
			}
			let x1 = Math.round(p['width'] * (x - sh) / w);
			let y1 = Math.round(p['height'] * (y - sh) / h);
			let x2 = Math.round(p['width'] * (x + sh) / w);
			let y2 = Math.round(p['height'] * (y + sh) / h);
			this._convArrayToImageLwipMarkerRectangle(image, x1, y1, x2, y2, color).then(() => {
				rect_idx ++;
				drawRectangle(cb);
			}).catch((error) => {
				cb(error);
			});
		};
		drawRectangle((error) => {
			if(error) {
				reject(error);
			} else {
				resolve();
			}
		});
	});
	return promise;
};

HvcP2Image.prototype._convArrayToImageLwipMarkerHand = function(image, p, result, w, h) {
	let promise = new Promise((resolve, reject) => {
		if(!('hand' in result)) {
			resolve();
			return;
		}
		let rect_num = result['hand'].length;
		let rect_idx = 0;
		let drawRectangle = (cb) => {
			if(rect_idx === rect_num) {
				cb();
				return;
			}
			let o = result['hand'][rect_idx];
			let x = o['x'];
			let y = o['y'];
			let s = o['size'];
			let sh = s / 2;
			let color = [255, 255, 0, 100];
			let x1 = Math.round(p['width'] * (x - sh) / w);
			let y1 = Math.round(p['height'] * (y - sh) / h);
			let x2 = Math.round(p['width'] * (x + sh) / w);
			let y2 = Math.round(p['height'] * (y + sh) / h);
			this._convArrayToImageLwipMarkerRectangle(image, x1, y1, x2, y2, color).then(() => {
				rect_idx ++;
				drawRectangle(cb);
			}).catch((error) => {
				cb(error);
			});
		};
		drawRectangle((error) => {
			if(error) {
				reject(error);
			} else {
				resolve();
			}
		});
	});
	return promise;
};

HvcP2Image.prototype._convArrayToImageLwipMarkerBody = function(image, p, result, w, h) {
	let promise = new Promise((resolve, reject) => {
		if(!('body' in result)) {
			resolve();
			return;
		}
		let rect_num = result['body'].length;
		let rect_idx = 0;
		let drawRectangle = (cb) => {
			if(rect_idx === rect_num) {
				cb();
				return;
			}
			let o = result['body'][rect_idx];
			let x = o['x'];
			let y = o['y'];
			let s = o['size'];
			let sh = s / 2;
			let color = [255, 255, 0, 100];
			let x1 = Math.round(p['width'] * (x - sh) / w);
			let y1 = Math.round(p['height'] * (y - sh) / h);
			let x2 = Math.round(p['width'] * (x + sh) / w);
			let y2 = Math.round(p['height'] * (y + sh) / h);
			this._convArrayToImageLwipMarkerRectangle(image, x1, y1, x2, y2, color).then(() => {
				rect_idx ++;
				drawRectangle(cb);
			}).catch((error) => {
				cb(error);
			});
		};
		drawRectangle((error) => {
			if(error) {
				reject(error);
			} else {
				resolve();
			}
		});
	});
	return promise;
};

HvcP2Image.prototype._convArrayToImageLwipMarkerRectangle = function(image, x1, y1, x2, y2, color) {
	let promise = new Promise((resolve, reject) => {
		let x_min = Math.min(x1, x2);
		let x_max = Math.max(x1, x2);
		let y_min = Math.min(y1, y2);
		let y_max = Math.max(y1, y2);
		let x = x_min;
		let y = y_min;
		let side = 'top';
		let drawPixel = (cb) => {
			if(y > y_max) {
				cb();
				return;
			}
			image.setPixel(x, y, color, (e, img) => {
				if(e) {
					cb(e);
				} else {
					if(side === 'top') {
						x ++;
						if(x === x_max) {
							side = 'right';
							y ++;
						}
						drawPixel(cb);
					} else if(side === 'right') {
						y ++;
						if(y === y_max) {
							side = 'bottom';
							x --;
						}
						drawPixel(cb);
					} else if(side === 'bottom') {
						x --;
						if(x === x_min) {
							side = 'left';
							y --;
						}
						drawPixel(cb);
					} else if(side === 'left') {
						y --;
						if(y === y_min) {
							cb();
						} else {
							drawPixel(cb);
						}
					}
				}
			});
		};
		drawPixel((error) => {
			if(error) {
				reject(error);
			} else {
				resolve();
			}
		});
	});
	return promise;
};

module.exports = new HvcP2Image();