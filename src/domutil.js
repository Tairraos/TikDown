function $(arg) {
    if (arg.match(/^</)) {
        const template = document.createElement("template");
        template.innerHTML = arg;
        return template.content.firstChild;
    }
    return document.querySelector(arg);
}

function getIconComponent(type, cls, iconName, i18nKey, ...args) {
    const domStr = [
        `<${type} class="icon-${cls} ${cls}-iconName">`,
        `<span class="icon ${iconName}"><svg><use xlink:href="#icon-${iconName}"/></svg></span>`,
        `<span class="text">${i18n.get(i18nKey, ...args)}</span>`,
        `</${type}>`
    ].join("");
    return $(domStr);
}
