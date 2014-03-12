var path = require('path'),
	fs = require('fs'),
	fTools = require('filetools'),
	cssom = require('cssom'),
	imgTool = require('imgmerge')

var defConf = {
	workspace: 'src/www/front/resource/',
	css_dir: 'css/',
	output: {
		img: '/resource/img/sprite'
	}
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
	fileName = path.join(fileName);

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

		//禁止 @import出现 （这种规则是打包策略）
		if(!style) return

		var imgUrl = getUrl(style, fileDir),
			imageAbsUrl,
			fileName,
			bgRepeat = style['background-repeat'],
			align = 'N';

		if(imgUrl){
			imageAbsUrl = path.join(fileDir, imgUrl);
			fileName = imageAbsUrl;

			if(!fs.existsSync(fileName)){
				return;
			}

			if(bgRepeat == 'repeat-x'){
				align = 'X'
			}

			if(bgRepeat == 'repeat-y'){
				align = 'Y'
			}

			if(!result[imageAbsUrl]){
				result[imageAbsUrl] = {
					align: align,
					imageUrl: imgUrl,
					imageAbsUrl: imageAbsUrl,
					cssRules: []
				}
				result.length++;
			}

			result[imageAbsUrl].cssRules.push(style);

		}

	})

	return result;

}

function getUrl(style, dir){

	var backgroundImage = style['background-image'];
	// undefined => return
	if(!backgroundImage){
		return null;
	}
	// 多个图片暂时不支持
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

/**
 * 调整 样式规则的像素值, 如果原来就有值, 则在原来的基础上变更
 */
function setPxValue(style, attr, newValue){
	var value;
	if(style[attr]){
		value = parseInt(style[attr]);
	}else{
		value = 0;
		style[style.length++] = attr;
	}
	value = value - newValue;
	value = value ? value + 'px' : '0';
	style[attr] = value;
}

var updateBackgroundPos = function(obj, styleSheet, type){
	type = type || '';
	styleSheet[obj.file].cssRules.forEach(function(style){

		style['background-image'] = 'url(' + defConf.output.img + '/output'+type+'.png' + ')';

		setPxValue(style, 'background-position-x', obj.fit.x);
		setPxValue(style, 'background-position-y', obj.fit.y);

		mixBackground(style);

	});
}


function exportCssFile(spriteTask){
	var cssContentList = [],
		styleSheetArray = [spriteTask.styleSheet],
		cssContent = ''

	styleSheetArray.forEach(function(styleSheet){
		cssContentList.push(styleSheetToString(styleSheet));
	})

	cssContent = cssContentList.join('\n');

	fTools.writeFile(spriteTask.cssFileName, cssContent, 'utf8');

}


module.exports = function(opts){

	defConf = fTools.mix(defConf, opts);

	fTools.walk(defConf.workspace + defConf.css_dir, function(list){

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
		});
		/**
		 *
		 */
		spriteTaskArr.forEach(function(taskArr){

			var noRepeat = [],
				xRepeat = [],
				yRepeat = []

			var objList = taskArr.styleObjList;

			for(var key in objList){
				if(key == 'length') continue
				switch (objList[key].align){
					case 'N':
						noRepeat.push(objList[key].imageAbsUrl)
						break;
					case 'X':
						xRepeat.push(objList[key].imageAbsUrl);
						break
					case 'Y':
						yRepeat.push(objList[key].imageAbsUrl);
						break;
				}

			}

			function combo(styleObjArr, type){
				var draw = imgTool.spFile(styleObjArr, {
					isNeedAlign: false
				});

				draw(styleObjArr, type, function(obj){
					updateBackgroundPos(obj, objList, type);
				},{
					public_dir: defConf.workspace + 'img/sprite/'
				});
			}

			// packer算法合并
			if(noRepeat.length){
				imgTool.imgsPosition(noRepeat, function(obj){
					combo(obj, null);
				});
			}


			// repeatX 合并
			if(xRepeat.length){
				imgTool.imgsPositionXY(xRepeat, 'X', function(obj){
					combo(obj, 'X');
				});
			}


			// repeatY 合并
			if(yRepeat.length){
				imgTool.imgsPositionXY(yRepeat, 'Y', function(obj){
					combo(obj, 'Y');
				});
			}


			exportCssFile(taskArr)

		})

		//var code = styleSheetToString(spriteTaskArr);
		//console.log(spriteTaskArr)


	});
}