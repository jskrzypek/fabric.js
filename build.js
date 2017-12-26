'use strict';
/* eslint-env node */
var fs = require('fs-extra'),
    exec = require('execa').shell,
    UglifyJS = require('uglify-js');

var buildArgs = process.argv.slice(2),
    buildArgsAsObject = { },
    rootPath = process.cwd();

buildArgs.forEach(function(arg) {
  var key = arg.split('=')[0],
      value = arg.split('=')[1];

  buildArgsAsObject[key] = value;
});

var modulesToInclude = buildArgsAsObject.modules ? buildArgsAsObject.modules.split(',') : [];
var modulesToExclude = buildArgsAsObject.exclude ? buildArgsAsObject.exclude.split(',') : [];

var distributionPath = buildArgsAsObject.dest || 'dist/';
// var minifier = buildArgsAsObject.minifier || 'uglifyjs';
var minifier = 'uglifyjs';
var mininfierCmd;

var noStrict = 'no-strict' in buildArgsAsObject;
var noSVGExport = 'no-svg-export' in buildArgsAsObject;
var requirejs = 'requirejs' in buildArgsAsObject ? 'requirejs' : false;
var sourceMap = 'sourcemap' in buildArgsAsObject;

// set amdLib var to encourage later support of other AMD systems
var amdLib = requirejs;

// if we want requirejs AMD support, use uglify
var amdUglifyFlags = '';
if (amdLib === 'requirejs' && minifier !== 'uglifyjs') {
  console.log('[notice]: require.js support requires uglifyjs as minifier; changed minifier to uglifyjs.');
  minifier = 'uglifyjs';
  amdUglifyFlags = ' -r \'require,exports,window,fabric\' -e \'window:window,undefined\' ';
}

// if we want sourceMap support, uglify or google closure compiler are supported
var sourceMapFlags = '';
// if (sourceMap) {
//   if (minifier !== 'uglifyjs' && minifier !== 'closure') {
//     console.log('[notice]: sourceMap support requires uglifyjs or google closure compiler as minifier; changed minifier to uglifyjs.');
//     minifier = 'uglifyjs';
//   }
//   sourceMapFlags = minifier === 'uglifyjs' ? ' --source-map fabric.min.js.map' : ' --create_source_map fabric.min.js.map --source_map_format=V3';
// }

if (minifier === 'yui') {
  mininfierCmd = 'java -jar ' + rootPath + '/lib/yuicompressor-2.4.6.jar fabric.js -o fabric.min.js';
}
else if (minifier === 'closure') {
  mininfierCmd = 'java -jar ' + rootPath + '/lib/google_closure_compiler.jar --js fabric.js --js_output_file fabric.min.js' + sourceMapFlags;
}
else if (minifier === 'uglifyjs') {
  // mininfierCmd = 'uglifyjs ' + amdUglifyFlags + ' --compress --mangle --output fabric.min.js fabric.js' + sourceMapFlags;
  mininfierCmd = () => fs.readFile('fabric.js', 'utf-8')
    .then((code) => {
      let result = UglifyJS.minify(code, {
        compress: true,
        mangle: true,
        sourceMap: {
          filename: 'fabric.min.js',
          url: 'fabric.min.js.map'
        }
      });
      return Promise.all([fs.writeFile('fabric.min.js', result.code, 'utf-8'), fs.writeFile('fabric.min.js.map', result.map, 'utf-8')]);
    });
}

var buildMinified = 'build-minified' in buildArgsAsObject;

var includeAllModules = (modulesToInclude.length === 1 && modulesToInclude[0] === 'ALL') || buildMinified;

var noSVGImport = (modulesToInclude.indexOf('parser') === -1 && !includeAllModules) || modulesToExclude.indexOf('parser') > -1;

var distFileContents =
  '/* build: `node build.js modules=' +
    modulesToInclude.join(',') +
    (modulesToExclude.length ? (' exclude=' + modulesToExclude.join(',')) : '') +
    (noStrict ? ' no-strict' : '') +
    (noSVGExport ? ' no-svg-export' : '') +
    (requirejs ? ' requirejs' : '') +
    (sourceMap ? ' sourcemap' : '') +
    ' minifier=' + minifier +
  '` */';

function appendFileContents(fileNames) {

  return (function readNextFile(contents) {

    if (fileNames.length <= 0) {
      return Promise.resolve(contents);
    }

    var fileName = fileNames.shift();

    if (!fileName) {
      return readNextFile(contents);
    }

    return fs.readFile(__dirname + '/' + fileName)
      .then(function (data) {
        // if (err) {
        //   err.stack = err.stack || Error.captureStackTrace(err);
        //   throw err;
        // };
        var strData = String(data);
        if (noStrict) {
          strData = strData.replace(/"use strict";?\n?/, '');
        }
        if (noSVGExport) {
          strData = strData.replace(/\/\* _TO_SVG_START_ \*\/[\s\S]*?\/\* _TO_SVG_END_ \*\//g, '');
        }
        if (noSVGImport) {
          strData = strData.replace(/\/\* _FROM_SVG_START_ \*\/[\s\S]*?\/\* _FROM_SVG_END_ \*\//g, '');
        }
        contents += ('\n' + strData + '\n');
        return readNextFile(contents);
      });
  })(distFileContents);
}

function ifSpecifiedInclude(moduleName, fileName) {
  var isInIncludedList = modulesToInclude.indexOf(moduleName) > -1;
  var isInExcludedList = modulesToExclude.indexOf(moduleName) > -1;

  // excluded list takes precedence over modules=ALL
  return ((isInIncludedList || includeAllModules) && !isInExcludedList) ? fileName : '';
}

function ifSpecifiedAMDInclude(amdLib) {
  var supportedLibraries = ['requirejs'];
  if (supportedLibraries.indexOf(amdLib) > -1) {
    return 'src/amd/' + amdLib + '.js';
  }
  return '';
}

var filesToInclude = [
  'HEADER.js',
  ifSpecifiedInclude('global', 'src/globalFabric.js'),
  ifSpecifiedInclude('gestures', 'lib/event.js'),

  'src/mixins/observable.mixin.js',
  'src/mixins/collection.mixin.js',
  'src/mixins/shared_methods.mixin.js',
  'src/util/misc.js',
  ifSpecifiedInclude('accessors', 'src/util/named_accessors.mixin.js'),
  'src/util/arc.js',
  'src/util/lang_array.js',
  'src/util/lang_object.js',
  'src/util/lang_string.js',
  'src/util/lang_class.js',
  ifSpecifiedInclude('interaction', 'src/util/dom_event.js'),
  'src/util/dom_style.js',
  'src/util/dom_misc.js',
  'src/util/dom_request.js',

  'src/log.js',

  ifSpecifiedInclude('animation', 'src/util/animate.js'),
  ifSpecifiedInclude('animation', 'src/util/animate_color.js'),
  //'src/util/animate.js',
  ifSpecifiedInclude('easing', 'src/util/anim_ease.js'),

  ifSpecifiedInclude('parser', 'src/parser.js'),
  ifSpecifiedInclude('parser', 'src/elements_parser.js'),

  'src/point.class.js',
  'src/intersection.class.js',
  'src/color.class.js',

  ifSpecifiedInclude('gradient', 'src/gradient.class.js'),
  ifSpecifiedInclude('pattern', 'src/pattern.class.js'),
  ifSpecifiedInclude('shadow', 'src/shadow.class.js'),

  'src/static_canvas.class.js',

  ifSpecifiedInclude('freedrawing', 'src/brushes/base_brush.class.js'),

  ifSpecifiedInclude('freedrawing', 'src/brushes/pencil_brush.class.js'),
  ifSpecifiedInclude('freedrawing', 'src/brushes/circle_brush.class.js'),
  ifSpecifiedInclude('freedrawing', 'src/brushes/spray_brush.class.js'),
  ifSpecifiedInclude('freedrawing', 'src/brushes/pattern_brush.class.js'),

  ifSpecifiedInclude('interaction', 'src/canvas.class.js'),
  ifSpecifiedInclude('interaction', 'src/mixins/canvas_events.mixin.js'),
  ifSpecifiedInclude('interaction', 'src/mixins/canvas_grouping.mixin.js'),

  'src/mixins/canvas_dataurl_exporter.mixin.js',

  ifSpecifiedInclude('serialization', 'src/mixins/canvas_serialization.mixin.js'),
  ifSpecifiedInclude('gestures', 'src/mixins/canvas_gestures.mixin.js'),

  'src/shapes/object.class.js',
  'src/mixins/object_origin.mixin.js',
  'src/mixins/object_geometry.mixin.js',
  'src/mixins/object_stacking.mixin.js',
  'src/mixins/object.svg_export.js',
  'src/mixins/stateful.mixin.js',

  ifSpecifiedInclude('interaction', 'src/mixins/object_interactivity.mixin.js'),

  ifSpecifiedInclude('animation', 'src/mixins/animation.mixin.js'),

  'src/shapes/line.class.js',
  'src/shapes/circle.class.js',
  'src/shapes/triangle.class.js',
  'src/shapes/ellipse.class.js',
  'src/shapes/rect.class.js',
  'src/shapes/polyline.class.js',
  'src/shapes/polygon.class.js',
  'src/shapes/path.class.js',
  'src/shapes/group.class.js',
  ifSpecifiedInclude('interaction', 'src/shapes/active_selection.class.js'),
  'src/shapes/image.class.js',

  ifSpecifiedInclude('object_straightening', 'src/mixins/object_straightening.mixin.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/webgl_backend.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/2d_backend.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/base_filter.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/colormatrix_filter.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/brightness_filter.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/convolute_filter.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/grayscale_filter.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/invert_filter.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/noise_filter.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/pixelate_filter.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/removecolor_filter.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/filter_generator.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/blendcolor_filter.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/blendimage_filter.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/resize_filter.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/contrast_filter.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/saturate_filter.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/blur_filter.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/gamma_filter.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/composed_filter.class.js'),
  ifSpecifiedInclude('image_filters', 'src/filters/hue_rotation.class.js'),

  ifSpecifiedInclude('text', 'src/shapes/text.class.js'),
  ifSpecifiedInclude('text', 'src/mixins/text_style.mixin.js'),

  ifSpecifiedInclude('itext', 'src/shapes/itext.class.js'),
  ifSpecifiedInclude('itext', 'src/mixins/itext_behavior.mixin.js'),
  ifSpecifiedInclude('itext', 'src/mixins/itext_click_behavior.mixin.js'),
  ifSpecifiedInclude('itext', 'src/mixins/itext_key_behavior.mixin.js'),
  ifSpecifiedInclude('itext', 'src/mixins/itext.svg_export.js'),

  ifSpecifiedInclude('textbox', 'src/shapes/textbox.class.js'),
  ifSpecifiedInclude('textbox', 'src/mixins/textbox_behavior.mixin.js'),

  ifSpecifiedAMDInclude(amdLib)
];

if (buildMinified) {
  for (var i = 0; i < filesToInclude.length; i++) {
    if (!filesToInclude[i]) {continue;}
    var fileNameWithoutSlashes = filesToInclude[i].replace(/\//g, '^');
    exec('uglifyjs -nc ' + amdUglifyFlags + filesToInclude[i] + ' > tmp/' + fileNameWithoutSlashes);
  }
}
else {
  // change the current working directory
  process.chdir(distributionPath);

  appendFileContents(filesToInclude.slice())
    .then(function(code) {
      return fs.writeFile('fabric.js', code);
    })
    .then(function () {
      // if (err) {
      //   console.log(err);
      //   throw err;
      // }

      // // add js wrapping in AMD closure for requirejs if necessary
      // if (amdLib !== false) {
      //   exec('uglifyjs fabric.js ' + amdUglifyFlags + ' -b --output fabric_ugly.js');
      // }

      // if (amdLib !== false) {
      //   console.log('Built distribution to ' + distributionPath + 'fabric.js (' + amdLib + '-compatible)');
      // } else {
      //   console.log('Built distribution to ' + distributionPath + 'fabric.js');
      // }

      return mininfierCmd();
    })
    .then(function () {
      // if (error) {
      //   console.error('Minification failed using', minifier, 'with', mininfierCmd);
      //   console.error('Minifier error output:\n' + error);
      //   console.error('Minifier error output:\n' + output);
      //   error.stack = error.stack || Error.captureStackTrace(error);
      //   throw error;
      // // process.exit(1);
      // }
      console.log('Minified using', minifier, 'to ' + distributionPath + 'fabric.min.js');

      if (sourceMapFlags) {
        console.log('Built sourceMap to ' + distributionPath + 'fabric.min.js.map');
      }

      return exec('gzip -c fabric.min.js > fabric.min.js.gz');
    })
    .then(() => {


      // Always build requirejs AMD module in fabric.require.js
      // add necessary requirejs footer code to filesToInclude if we haven't before
      if (amdLib === false) {
        amdLib = 'requirejs';
        filesToInclude[filesToInclude.length] = ifSpecifiedAMDInclude(amdLib);
      }

      return appendFileContents(filesToInclude.slice());
    })
    .then(() => fs.writeFile('fabric.require.js', distFileContents))
    .then(function () {
      // if (err) {
      //   console.log(err);
      //   throw err;
      // }
      return exec('uglifyjs fabric.require.js ' + amdUglifyFlags + ' -b --output fabric.require.js');
    })
    .then(()=>{
      console.log('Built distribution to ' + distributionPath + 'fabric.require.js (requirejs-compatible)');
    });
}
