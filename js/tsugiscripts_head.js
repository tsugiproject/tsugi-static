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

// Make sure to polyfill web coponent capabilities
// https://www.webcomponents.org/polyfills
if ('registerElement' in document
      && 'import' in document.createElement('link')
      && 'content' in document.createElement('template')) {
    // platform is good!
    // console.log("All good... "+_TSUGI.staticroot);
} else {
    // polyfill the platform!
    var e = document.createElement('script');
    e.src = _TSUGI.staticroot+'/polyfill/webcomponentsjs-1.0.5/webcomponents-lite.js'
    window.console && console.log("Polyfill web components.. "+e.src);
    document.body.appendChild(e);
}

// Make sure to polyfill fetch() if needed
// https://github.com/github/fetch

if (window.fetch) {
    // console.log("Fetch is already there...");
} else {
    // polyfill fetch()
    var e = document.createElement('script');
    e.src = _TSUGI.staticroot+'/polyfill/fetch-2.0.3/fetch.js'
    window.console && console.log("Polyfill fetch.. "+e.src);
    document.body.appendChild(e);
}
