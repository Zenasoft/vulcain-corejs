var os = require('os');
var Path = require('path');
var fs = require('fs');

var gulp = require("gulp"),
    ts = require("gulp-typescript"),
    merge = require('merge2'),
    fse = require('fs-extra'),
    mocha = require('gulp-mocha'),
    istanbul = require('gulp-istanbul'),
    sourcemaps = require('gulp-sourcemaps'),
    concat = require("gulp-concat"),
    tslint = require("gulp-tslint");

// Base root directory for source map
var rootDir = "file://" + __dirname;
process.on('uncaughtException', console.error.bind(console));

gulp.task('default', ['compile-ts']);

gulp.task('tslint', function () {
    return gulp.src('./src/**/*.ts')
        .pipe(tslint())
        .pipe(tslint.report("prose"));
});

// -----------------------------------
// Test
// -----------------------------------
gulp.task("compile-test", ['compile-ts'], function () {
    var tsProject = ts.createProject(
        './tsconfig.json',
        {
            sortOutput: true,
            typescript: require('typescript')    // must be a project package dependency
        });

    var tsResult = gulp.src([
        "./test/**/*.ts",
        "./typings/index.d.ts"
    ], { base: './test/' })
        .pipe(sourcemaps.init())
        .pipe(ts(tsProject));

    return tsResult.js
        .pipe(sourcemaps.write('.', { includeContent: false, sourceRoot: rootDir + "/test" }))
        .pipe(gulp.dest("dist-test/"));
});

gulp.task("istanbul:hook", function () {
    return gulp.src(['dist/**/*.js'])
        // Covering files
        .pipe(istanbul())
        // Force `require` to return covered files
        .pipe(istanbul.hookRequire());
});


var typedoc = require("gulp-typedoc");
gulp.task("typedoc", function () {
    return gulp
        .src(["src/**/*.ts",
            "./typings/index.d.ts"])
        .pipe(typedoc({
            "emitDecoratorMetadata": true,
            "experimentalDecorators": true,
            "module": "commonjs",
            "moduleResolution": "node",
            "target": "es6",
            "--excludePrivate": true,
            out: "docs/",
            name: "Vulcain corejs"
        }))
        ;
});

// -----------------------------------
// Compilation
// -----------------------------------
function incrementVersion() {
    var dockerfile = Path.join(__dirname, "Dockerfile");
    var content = fs.readFileSync(dockerfile, 'UTF-8');
    var version = /^(LABEL vulcain\.version=[0-9]+\.[0-9]+\.)([0-9]+)/m;
    var matches = version.exec(content);
    var build = parseInt(matches[2]);
    build += 1;
    content = content.replace(version, '$1' + build.toString());
    fs.writeFileSync(dockerfile, content, 'UTF-8');
}

// https://www.npmjs.com/package/gulp-typescript
gulp.task("compile-ts", ['clean'], function () {
    //incrementVersion();
    var tsProject = ts.createProject(
        './tsconfig.json',
        {
            sortOutput: true,
            typescript: require('typescript')    // must be a project package dependency
        });

    var tsResult = gulp.src([
        "./src/**/*.ts",
        "./typings/index.d.ts"
    ])
        .pipe(sourcemaps.init())
        .pipe(ts(tsProject));

    return merge([
        tsResult.dts
            .pipe(gulp.dest('dist')),
        tsResult.js
            .pipe(sourcemaps.write('.', { includeContent: false, sourceRoot: rootDir + "/src" }))
            .pipe(gulp.dest('dist'))
    ]
    );
});

gulp.task('clean', function (done) { fse.remove('dist', fse.remove('dist-test', done)); });
