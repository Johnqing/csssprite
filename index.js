var path = require('path'),
	fs = require('fs'),
	fTools = require('filetools'),
	cssom = require('cssom')

var defConf = {
	workspace: './src/www/front/resource/css'
}

/**
 * 所用到的一些正则
 */
var regexp = {
	ignoreNetwork: /^(https?|ftp):\/\//i,
	ignorePosition: /right|center|bottom/i,
	image: /\(['"]?(.+\.(png|jpe?g|gif|bmp))((\?|#).*?)?['"]?\)/i,
	css: /(.+\.css).*/i,
	ignoreImage: /#unsp\b/i

}
/**
 * background整合
 * @param style
 */
function mixBackground(style){
	var background = ''
	var positionText = style.removeProperty('background-position-x') + ' ' +
		style.removeProperty('background-position-y');

	style.setProperty('background-position', positionText.trim(), null);

	var toMergeAttrs = [
		'background-color', 'background-image', 'background-position',
		'background-repeat','background-attachment',
		'background-origin', 'background-clip'
	];
	for(var i = 0, item; item = toMergeAttrs[i]; i++) {
		if(style.hasOwnProperty(item)){
			background += style.removeProperty(item) + ' ';
		}
	}
	style.setProperty('background', background.trim(), null);
}

function splitBackground(style){

	// 木有background，无法拆分
	if(!style['background']){
		return
	}

	var value

	if(value = style['background-position']){
		// 1px 2px => ['1px', '2px']
		value = value.trim().replace(/\s{2}/g, '').split(' ');
		// 1px => ['1px', '1px']
		if(!value[1]){
			value[1] = value[0]
		}

		style['background-position-x'] = value[0];
		style['background-position-y'] = value[1];
	}

}

/**
 * 读取css文件的 规则
 * @param fileName
 * @returns {*}
 */
function readStyleSheet(fileName){
	fileName = path.join(defConf.workspace, fileName);

	if(!fs.existsSync(fileName)){
		return null;
	}

	var content = fs.readFileSync(fileName);
	return cssom.parse(content.toString());

}
/**
 * 需要合并的样式和图片
 * @param styleSheet
 * @param cssFilePath
 * @param result
 * @returns {{length: number}}
 */
function collectStyleRules(styleSheet, cssFilePath, result){
	result = result ||{
		length: 0
	}
	// 没有样式
	if(!styleSheet.cssRules.length){
		return result;
	}
	var fileDir = path.dirname(cssFilePath);
	// 提取规则
	styleSheet.cssRules.forEach(function(rule){
		var style = rule.style;
		//mixBackground(style);

		var imgUrl = getUrl(style, fileDir),
			imageAbsUrl,
			fileName

		if(imgUrl){
			imageAbsUrl = path.join(fileDir, imgUrl);
			fileName = path.join(defConf.workspace, imageAbsUrl);

			if(!fs.existsSync(fileName)){
				return;
			}

			if(!result[imgUrl]){
				result[imgUrl] = {
					imageUrl: imgUrl,
					imageAbsUrl: imageAbsUrl,
					cssRules: []
				}
				result.length++;
			}

			result[imgUrl].cssRules.push(style);

		}

	})

	return result;

}

function getUrl(style, dir){
	var backgroundImage = style['background-image'];

	if(!backgroundImage){
		return null;
	}

	if(~backgroundImage.indexOf(',')){
		return null
	}

	var match = backgroundImage.match(regexp.image),
		url, ext

	if(match){
		url = match[1]
		ext = match[2]

		if(regexp.ignoreImage.test(backgroundImage)){
			url = backgroundImage.replace(regexp.ignoreImage, '');
			style.setProperty('background-image', url, null);
			return null;
		}

	} else {
		return null;
	}
	// http://xxx
	if(regexp.ignoreNetwork.test(url)){
		return null;
	}

	if(defConf.ignoreImages){
		for(var i=0; i<defConf.ignoreImages.length; i++){
			if(ignoreImages[i].test(url)){
				return null;
			}
		}
	}

	return url;

}


/**
 * 把 StyleSheet 的内容转换成 css 字符串
 * @param  {StyleSheet} styleSheet
 * @return {String} css 字符串
 */
function styleSheetToString(styleSheet) {
	var result = "";
	var rules = styleSheet.cssRules, rule;
	for (var i=0; i<rules.length; i++) {
		rule = rules[i];
		if(rule instanceof cssom.CSSImportRule){
			result += styleSheetToString(rule.styleSheet) + '\n';
		}else{
			result += rule.cssText + '\n';
		}
	}
	return result;
};



module.exports = function(opts){

	defConf = fTools.mix(defConf, opts);

	fTools.walk(defConf.workspace, function(list){

		var spriteTaskArr = [];

		list.forEach(function(file){

			var spriteTask = {
				cssFileName: file,
				styleSheet: readStyleSheet(file),
				styleObjList: null,
				spriteArray: null
			}

			var styleObjList = spriteTask.styleObjList = collectStyleRules(spriteTask.styleSheet, file);

			if(!styleObjList.length){
				return
			}

			spriteTaskArr.push(spriteTask);
		})

		console.log(spriteTaskArr)

	});
}