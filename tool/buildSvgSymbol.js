var fs = require("fs"),
    path = require("path"),
    cheerio = require("cheerio"),
    svgSource = path.join(__dirname, "../resource"),
    targetJsFile = path.join(__dirname, "../icons.js");

var svgBuilder = {
    getSvgList: () => fs.readdirSync(svgSource).filter((name) => fs.statSync(path.join(svgSource + "/" + name)).isFile() && name.match(/\.svg$/)),
    getFileContent: (file) => fs.readFileSync(file, { encoding: "utf8" }),
    saveFile: (file, content) => fs.writeFileSync(file, content, { encoding: "utf8" }),
    isUselessTag: (name) => ["symbol", "title", "desc", "use", "script"].indexOf(name) > -1,
    isEmptyTag: (dom) => JSON.stringify(dom.attr()) === "{}" && !dom.children().length,
    fetchSymbol: function (filename) {
        var fileContent = svgBuilder.getFileContent(path.join(svgSource, filename)),
            $ = cheerio.load(fileContent, {
                normalizeWhitespace: false,
                xmlMode: true
            }),
            id = "icon-" + filename.replace(/\.svg$/, "").replace(/\s+/g, "-"),
            svg = $("svg"),
            children = svg.children(),
            symbolContent = [];
        console.log("Building:", filename);
        svg.find("g,circle,ellipse,image,line,path,pattern,polygon,polyline,rect,text").removeAttr("id");
        symbolContent.push('<symbol id="' + id + '" viewBox="' + svg.attr("viewBox") + '">');
        for (var i = 0; i < children.length; i++) {
            var child = children.eq(i);
            if (!svgBuilder.isUselessTag(children.get(i).tagName) && !svgBuilder.isEmptyTag(child)) {
                symbolContent.push("    " + $.html(child));
            }
        }
        symbolContent.push("</symbol>");
        return symbolContent;
    },

    doBuild: function () {
        var svgContent = [];
        var nameList = svgBuilder.getSvgList(svgSource);
        svgContent.push('<div style="height: 0; position: absolute; top: -1000px">');
        svgContent.push('<svg xmlns="http://www.w3.org/2000/svg">');
        console.log("Start to build svg symbol from: ", svgSource);

        nameList.forEach(function (name) {
            svgContent.push(...svgBuilder.fetchSymbol(name));
        });
        svgContent.push("</svg>");
        svgContent.push("</div>");

        console.log("Saving JS file to ", targetJsFile);
        let outContent = [
            `const svgSymbol = [`,
            svgContent.map((line) => `'${line}'`).join(",\n"),
            `]`,
            `document.body.insertAdjacentHTML("afterBegin", svgSymbol.join(""));`
        ];
        svgBuilder.saveFile(targetJsFile, outContent.join("\n"));
        console.log("Build success.");
    }
};

svgBuilder.doBuild();
