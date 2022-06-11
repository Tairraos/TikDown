function $(arg) {
    if (arg.match(/^</)) {
        const template = document.createElement("template");
        template.innerHTML = arg;
        return template.content.firstChild;
    }
    return document.querySelector(arg);
}

function getIconComponent(type, cls, iconName, i18nKey, data) {
    const domStr = [
        `<${type} class="icon-${cls} ${cls}-iconName">`,
        `<span class="icon ${iconName}"><svg><use xlink:href="#icon-${iconName}"/></svg></span>`,
        `<span class="text">${i18n.get(i18nKey)}</span>`,
        data !== undefined ? `<span class="data">${data}</span>` : "",
        `</${type}>`
    ].join("");
    return $(domStr);
}
