// This is a small amount of JavaScript included in the head area

// The scripts for the TSUGI runtime

// Make sure console.log does not fail.
if(typeof console === "undefined") { var console = { log: function (logMsg) { } }; }

function dataToggle(divName) {
    var ele = document.getElementById(divName);
    if(ele.style.display == "block") {
        ele.style.display = "none";
    }
    else {
        ele.style.display = "block";
    }
}

// https://gist.github.com/flesch/315070
function sprintf(){
    var args = Array.prototype.slice.call(arguments);
    return args.shift().replace(/%s/g, function(){
        return args.shift();
    });
}

// http://stackoverflow.com/questions/326069/how-to-identify-if-a-webpage-is-being-loaded-inside-an-iframe-or-directly-into-t
function inIframe () {
    try {
        return window.self !== window.top;
    } catch (e) {
        return true;
    }
}

// Make sure to polyfill web component capabilities
// https://www.webcomponents.org/polyfills
if (false && 'registerElement' in document
      && 'import' in document.createElement('link')
      && 'content' in document.createElement('template')) {
    // platform is good!
    // console.log("All good... "+_TSUGI.staticroot);
} else {
    // polyfill the platform!
    var polyfill = _TSUGI.staticroot+'/polyfill/webcomponentsjs-1.0.5/webcomponents-lite.js'
    // Make this the next to load...
    document.write('<scr'+'ipt type="text/javascript" src="'+polyfill+'"></scr'+'ipt>');
    console.log("Polyfill web components.. "+polyfill);
}

// Make sure to polyfill fetch() if needed
// https://github.com/github/fetch

if (window.fetch) {
    // console.log("Fetch is already there...");
} else {
    // polyfill fetch()
    var polyfill = _TSUGI.staticroot+'/polyfill/fetch-2.0.3/fetch.js'
    document.write('<scr'+'ipt type="text/javascript" src="'+polyfill+'"></scr'+'ipt>');
    console.log("Polyfill fetch.. "+polyfill);
}
