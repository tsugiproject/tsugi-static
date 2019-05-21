// The scripts for the TSUGI runtime
// Needs to be loaded at the end after JQuery is loaded

// Send the CRF token on all of the non-ajax() calls
$.ajaxSetup({
    cache: false,
    headers : {
        'X-CSRF-Token' : CSRF_TOKEN
    }
});

function doHeartBeat() {
    // Legacy
    if ( window.HEARTBEAT_URL ) {
        window.console && console.log('Calling legacy heartbeat to extend session');
        $.getJSON(HEARTBEAT_URL, function(data) {
            window.console && console.log(data);
            if ( data.lti || data.cookie ) {
                // No problem
            } else {
                clearInterval(HEARTBEAT_INTERVAL);
                HEARTBEAT_INTERVAL = false;
                alert(_TSUGI.session_expire_message);
                window.location.href = "about:blank";
            }
        }).fail(function() {
            console.log( "clearing interval" );
            clearInterval(HEARTBEAT_INTERVAL);
            HEARTBEAT_INTERVAL = false;
        });
    // New way - Only start timer upon success, add a minimum
    } else {
        window.console && console.log('Calling heartbeat to extend session');
        $.getJSON(_TSUGI.heartbeat_url, function(data) {
            window.console && console.log(data);
            if ( data.lti || data.cookie ) {
                var howlong = _TSUGI.heartbeat;
                if ( howlong < 5*60*1000 ) {
                    console.log('Timer was too short',howlong);
                    howlong = 5*60*1000;
                }
                HEARTBEAT_TIMEOUT = setTimeout(doHeartBeat, howlong);
            }
        });
    }
}

var DE_BOUNCE_LTI_FRAME_RESIZE_TIMER = false;
var DE_BOUNCE_LTI_FRAME_RESIZE_HEIGHT = false;

// Adapted from Lumen Learning / Bracken Mosbacker
// element_id is the id of the frame in the parent document
function lti_frameResize(new_height, element_id) {
    if ( self == top ) return;

    if ( !new_height ) {
        new_height = $(document).height() + 10;
    }
    if ( new_height < 100 ) new_height = 100;
    if ( new_height > 5000 ) new_height = 5000;

    if ( DE_BOUNCE_LTI_FRAME_RESIZE_HEIGHT ) {
        delta = new_height - DE_BOUNCE_LTI_FRAME_RESIZE_HEIGHT;
        if ( new_height == 5000 && DE_BOUNCE_LTI_FRAME_RESIZE_HEIGHT >= 5000 ) {
            console.log("maximum lti_frameResize 5000 exceeded");
            return;
        } else if ( new_height > (DE_BOUNCE_LTI_FRAME_RESIZE_HEIGHT + 10) ) {
            // Do the resize for small increases
        } else if ( new_height < (DE_BOUNCE_LTI_FRAME_RESIZE_HEIGHT - 30) ) {
            // Do the resize for large decreases
        } else {
            console.log("lti_frameResize delta "+delta+" is too small, ignored");
            return;
        }
    }

    if ( DE_BOUNCE_LTI_FRAME_RESIZE_TIMER ) {
        clearTimeout(DE_BOUNCE_LTI_FRAME_RESIZE_TIMER);
        DE_BOUNCE_LTI_FRAME_RESIZE_TIMER = false;
    }

    DE_BOUNCE_LTI_FRAME_RESIZE_TIMER = setTimeout(
        function () { lti_frameResizeNow(new_height, element_id); },
        1000
    );
}

function lti_frameResizeNow(new_height, element_id) {
    parms = {
      subject: "lti.frameResize",
      height: new_height
    }
    if ( element_id ) {
        parms.element_id = element_id;
    }
    var parm_str = JSON.stringify(parms);

    console.log("sending "+parm_str);
    parent.postMessage(parm_str, "*");

    DE_BOUNCE_LTI_FRAME_RESIZE_HEIGHT = new_height;
}

function lti_hideLMSNavigation() {
    parent.postMessage(JSON.stringify({
      subject: "lti.hideModuleNavigation",
      show: false
    }), "*");
}

function lti_showLMSNavigation() {
    parent.postMessage(JSON.stringify({
      subject: "lti.showModuleNavigation",
      show: true
    }), "*");
}

// tell the parent iframe to scroll to top
function lti_scrollParentToTop() {
    parent.postMessage(JSON.stringify({
      subject: "lti.scrollToTop"
    }), "*");
}

// Straight Outta Github (with adaptations)
// https://github.com/lumenlearning/candela/blob/master/wp-content/plugins/candela-utility/themes/bombadil/js/iframe_resizer.js
/**
 * Listen for a window post message to resize an embedded iframe
 * Needs to be an json stringified object that identifies the id of
 * the element to resize like this:
   parent.postMessage(JSON.stringify({
      subject: "lti.frameResize",
      height: default_height,
      element_id: "lumen_assessment_1"
  }), "*");
 * The element_id needed is passed as a query parameter `iframe_resize_id`
 */

// Unlike candela, we always do this - even if we are in an iframe - Inception
// console.log(window.location.href + "setting up listener");
window.addEventListener('message', function (e) {
    // console.log(window.location.href + " got message");
    // console.log(e.data);
    try {
        var message = JSON.parse(e.data);
        switch (message.subject) {
            case 'lti.frameResize':
                var height = message.height;
                if (height >= 5000) height = 5000;
                if (height <= 0) height = 1;
                if ( message.element_id ) {
                    var $iframe = jQuery('#' + message.element_id);
                    $iframe.css('height', height + 'px');
                    console.log("window.location.href set "+message.element_id+" height="+height);
                } else { // Must loop through all of them - best if there is one
                    $('.lti_frameResize').each(function(i, obj) {
                        $(this).css('height', height + 'px');
                        console.log("window.location.href set height="+height);
                    });
                }
                break;
        }
    } catch (err) {
        console.log('invalid message received from ', e.origin);
        console.log(e.data);
        console.log('Exception: '+err)
    }
});

// If we are not the top frame - immediately communicate our size and jack into the JQuery resize
// Debounce happens in lti_frameResize()
if ( ! (self == top) ) {
    if ( typeof LTI_PARENT_IFRAME_ID === 'undefined' ) {
        lti_frameResize();
        $(window).on('resize', function() { lti_frameResize(); });
    } else {
        lti_frameResize(false, LTI_PARENT_IFRAME_ID);
        $(window).on('resize', function() { lti_frameResize(false, LTI_PARENT_IFRAME_ID); });
    }
}

// From Sakai
// Return the breakpoint between small and medium sized displays - for morpheus currently the same
function portalSmallBreakPoint() { return 800; }
function portalMediumBreakPoint() { return 800; }

// Return the correct width for a modal dialog.
function modalDialogWidth() {
    var wWidth = $(window).width();
    var pbr = portalSmallBreakPoint();
    var dWidth = wWidth * 0.8;
    if ( wWidth <= pbr ) {
        dWidth = pbr * 0.8;
        if ( dWidth > (wWidth * 0.95) ) {
            dWidth = wWidth * 0.95;
        }
    }
    if ( dWidth < 300 ) dWidth = 300; // Should not happen
    return Math.round(dWidth);
}

// If the enclosing modal is content from the background document
function showModal(title, modalId) {
    console.log("showModal "+modalId);
    $("#"+modalId).dialog({
        title: title,
        width: modalDialogWidth(),
        position: { my: "center top+30px", at: "center top+30px", of: window },
        modal: true,
        draggable: false
    });

    // In order to float above the BootStrap navigation
    $('.ui-dialog').css('z-index',9999);

    $(window).resize(function() {
        $("#"+modalId).dialog("option", "width", modalDialogWidth());
    });
}

// If the enclosing modal contains an iframe
function showModalIframe(title, modalId, iframeId, spinnerUrl, refreshParentOnClose) {
    console.log("showModalIframe "+modalId);
    $("#"+modalId).css('zIndex',9999);
    $("#"+modalId).dialog({
        title: title,
        width: modalDialogWidth(),
        position: { my: "center top+30px", at: "center top+30px", of: window },
        modal: true,
        draggable: false,
        open: function() {
            $('#'+iframeId).width('95%');
        },
        close: function() {
            if ( spinnerUrl ) {
                $('#'+iframeId).attr('src',spinnerUrl);
            }
            if ( refreshParentOnClose ) {
                location.reload();
            }
        }
    });

    // In order to float above the BootStrap navigation
    $('.ui-dialog').css('z-index',9999);

    $(window).resize(function() {
        $("#"+modalId).dialog("option", "width", modalDialogWidth());
        $('#'+iframeId).width('95%');
    });
}

// Attempt to fix Chrome issue
// https://stackoverflow.com/questions/7551912/jquery-force-set-src-attribute-for-iframe
// If the enclosing modal contains an iframe, set the src after the modal is up
function showModalIframeUrl(title, modalId, iframeId, url, spinnerUrl, refreshParentOnClose) {
    showModalIframe(title, modalId, iframeId, spinnerUrl, refreshParentOnClose);
    console.log("Navigated "+url);
    $('#'+iframeId).attr('src',url);
}

/* Light YouTube Embeds by @labnol */
/* Web: http://labnol.org/?p=27941 */

$(document).ready(
// document.addEventListener("DOMContentLoaded",
    function() {
        var div, n,
            v = document.getElementsByClassName("youtube-player");
        for (n = 0; n < v.length; n++) {
            div = document.createElement("div");
            div.setAttribute("data-id", v[n].dataset.id);
            div.innerHTML = labnolThumb(v[n].dataset.id);
            div.onclick = labnolIframe;
            v[n].appendChild(div);
        }
    }
);

function labnolThumb(id) {
    var thumb = '<img src="https://i.ytimg.com/vi/ID/hqdefault.jpg">',
        play = '<div class="play"></div>';
    return thumb.replace("ID", id) + play;
}

function labnolIframe() {
    // Reset any currently active players...
    var v = document.getElementsByClassName("generated-youtube-frame");
    for (n = 0; n < v.length; n++) {
        div = document.createElement("div");
        div.setAttribute("data-id", v[n].dataset.id);
        div.innerHTML = labnolThumb(v[n].dataset.id);
        div.onclick = labnolIframe;
        v[n].parentNode.replaceChild(div, v[n]);
    }

    var iframe = document.createElement("iframe");
    var embed = "https://www.youtube.com/embed/ID?autoplay=1";
    iframe.setAttribute("src", embed.replace("ID", this.dataset.id));
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("class", "generated-youtube-frame");
    iframe.setAttribute("data-id", this.dataset.id);
    iframe.setAttribute("allowfullscreen", "1");
    iframe.setAttribute("webkitAllowFullScreen", "1");
    iframe.setAttribute("mozallowfullscreen", "1");
    this.parentNode.replaceChild(iframe, this);
}

var TSUGI_TEMPLATES = {};

function tsugiHandlebarsRender(name, context) {
    if ( ! (name in TSUGI_TEMPLATES ) ) {
        var source = false;
        var compile = false;

        // The pre-web component way
        if ( !compile ) {
            source  = $("#script-template-"+name).html();
            if ( source ) {
                console.log(source);
                compile = Handlebars.compile(source);
                window.console && console.log('Compiling '+name+' from script-template');
            }
        }

        // The pre-webcomponent way (old)
        if ( !compile ) {
            source  = $("#template-"+name).html();
            if ( source ) {
                console.log(source);
                compile = Handlebars.compile(source);
                window.console && console.log('Compiling '+name+' from script tag');
            }
        }

        // Check if this came in as a web component
        if ( ! compile && window.HandleBarsTemplateFromImport ) {
            source = window.HandleBarsTemplateFromImport('#webcomponents-template-'+name);
            if ( source ) {
                console.log(source);
                compile = Handlebars.compile(source);
                window.console && console.log('Compiling '+name+' from HandleBarsTemplateFromImport');
            }
        }

        // Check if the import flattened the imported content 
        // Here's looking at you FireFox and Safari
        var template = document.querySelector('#webcomponents-template-'+name);
        if ( ! compile && template ) {
            // Actual template
            if ( template.content && template.content.firstElementChild ) {
                source = template.content.firstElementChild.innerHTML;
            } else { // Old school script tag
                source = template.innerHTML;
            }
            if ( source ) {
                console.log(source);
                compile = Handlebars.compile(source);
                window.console && console.log('Compiling '+name+' from base document');
            }
        }

        if ( ! compile ) {
            window.console && console.log('Could not find template:'+name+' in HandleBarsTemplateFromImport');
            return false;
        }

        TSUGI_TEMPLATES[name] = compile;
    }
    window.console && console.log("Rendering "+name);
    var template = TSUGI_TEMPLATES[name];
    return template(context);
}

function tsugiHandlebarsToDiv(div, name, context) {
    $('#'+div).empty().append(tsugiHandlebarsRender(name, context));
}


// Straight outta W3Schools
// https://www.w3schools.com/js/js_cookies.asp
function tsugiSetCookie(cname, cvalue, exdays) {
    var d = new Date();
    d.setTime(d.getTime() + (exdays*24*60*60*1000));
    var expires = "expires="+ d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

// Figure out the maximum z-index
// http://stackoverflow.com/questions/1118198/how-can-you-figure-out-the-highest-z-index-in-your-document
function maxZIndex(elems)
{
    var maxIndex = 0;
    elems = typeof elems !== 'undefined' ? elems : $("*");

    $(elems).each(function(){
        maxIndex = (parseInt(maxIndex) < parseInt($(this).css('z-index'))) ? parseInt($(this).css('z-index')) : maxIndex;
    });

    return maxIndex;
}

// Show an overlay div
function showOverlay(elem, spinner) {
        elem = elem || "#tsugi_overlay";
        spinner = spinner || "#tsugi_overlay_spinner";
        elem="#tsugi_overlay", spinner="#tsugi_overlay_spinner"
        // In order to float above the BootStrap navigation
        var maxz = maxZIndex();
        $(elem).css('z-index',maxz+1);
        $(spinner).css('z-index',maxz+1);
        var top = ($(window).height() / 4) - ( $(spinner).height() / 2);
        if ( top < 10 ) top = 10;
        top = top +'px'
        $(spinner).css('margin-top',top);
        $(elem).show();
        $(spinner).show();
}

// Hide an overlay div
function hideOverlay(elem, spinner) {
        elem = elem || "#tsugi_overlay";
        spinner = spinner || "#tsugi_overlay_spinner";

        var maxz = maxZIndex();
        $(elem).css('z-index',-1);
        $(spinner).css('z-index',-1);
        $(elem).hide();
        $(spinner).hide();
}

$TSUGI_EMBED_TIMEOUT = false;
// Setup the menu
function tsugiEmbedMenu() {
    $('#tsugi-embed-menu').delay(1000).fadeIn(1000);
    $TSUGI_EMBED_TIMEOUT = setTimeout(function(){
        $('#tsugi-embed-menu').fadeOut(1000);
        $TSUGI_EMBED_TIMEOUT = false;
    }
    , 15000);
}

function tsugiEmbedKeep() {
    if ( $TSUGI_EMBED_TIMEOUT ) clearTimeout($TSUGI_EMBED_TIMEOUT);
    $TSUGI_EMBED_TIMEOUT = false;
}

// Make sure to polyfill web component capabilities
// https://www.webcomponents.org/polyfills
if ( 'registerElement' in document
      && 'import' in document.createElement('link')
      && 'content' in document.createElement('template')) {
    // platform is good!
    // console.log("Web Components there ... "+_TSUGI.staticroot);
    // Do this later than $(document).ready()
    $(window).on("load", function(){
        var event = new Event('WebComponentsReady');
        window.dispatchEvent(event);
    });
} else {
    var polyfill = _TSUGI.staticroot+'/polyfill/webcomponentsjs-1.0.22/webcomponents-lite.js'
    var e = document.createElement('script');
    e.src = polyfill;
    document.body.appendChild(e);
    console.log("Polyfill web components.. "+polyfill);
}

// Make sure to polyfill fetch() if needed
// https://github.com/github/fetch

if (window.fetch) {
    // console.log("Fetch is there...");
} else {
    // polyfill fetch()
    var polyfill = _TSUGI.staticroot+'/polyfill/fetch-2.0.3/fetch.js'
    var e = document.createElement('script');
    e.src = polyfill;
    document.body.appendChild(e);
    console.log("Polyfill fetch.. "+polyfill);
}

// https://stackoverflow.com/questions/19761241/window-close-and-self-close-do-not-close-the-window-in-chrome
// How to close a window even if we did not open it
function window_close()
{
    window.close();
    setTimeout(function(){ console.log("Attempting self.close"); self.close(); }, 1000);
    setTimeout(function(){ console.log("Notifying the user."); alert(_TSUGI.window_close_message); open("about:blank", '_self').close(); }, 2000);
}

function addSession(url) {
    if ( ! _TSUGI.ajax_session ) return url;
    var retval = url;
    if ( retval.indexOf('?') > 0 ) {
        retval += '&';
    } else {
        retval += '?';
    }
    retval += _TSUGI.ajax_session;
    return retval;
}

// https://stackoverflow.com/questions/18749591/encode-html-entities-in-javascript
if (typeof htmlentities != 'function')
{
function htmlentities(raw) {
    var span = document.createElement("span");
    span.textContent = raw;
    return span.innerHTML;
}
}

// Get a websocket
function tsugiNotifySocket(room) {
    if ( window.WebSocket && _TSUGI.websocket_url && _TSUGI.websocket_token ) {
        var url = _TSUGI.websocket_url+'/notify?token=';
        url = url + encodeURIComponent(_TSUGI.websocket_token);
        if ( room ) {
            url = url + "&room=" + encodeURIComponent(room);
        }
        console.log('Opening web socket',url);
        var socket = new WebSocket(url);
        return socket;
    }
    return false;
}

// Compute a sha256
// https://github.com/geraintluff/sha256
// https://geraintluff.github.io/sha256/
function tsugiSha256(ascii) {
    function rightRotate(value, amount) {
        return (value>>>amount) | (value<<(32 - amount));
    };

    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var lengthProperty = 'length';
    var i, j; // Used as a counter across the whole file
    var result = '';

    var words = [];
    var asciiBitLength = ascii[lengthProperty]*8;

    // Chuck - Turned off caching...
    /* caching results is optional - remove/add slash from front of this line to toggle
    // Initial hash value: first 32 bits of the fractional parts of the square roots of the first 8 primes
    // (we actually calculate the first 64, but extra values are just ignored)
    var hash = sha256.h = sha256.h || [];
    // Round constants: first 32 bits of the fractional parts of the cube roots of the first 64 primes
    var k = sha256.k = sha256.k || [];
    var primeCounter = k[lengthProperty];
    /*/
    var hash = [], k = [];
    var primeCounter = 0;
    //*/

    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (i = 0; i < 313; i += candidate) {
                isComposite[i] = candidate;
            }
            hash[primeCounter] = (mathPow(candidate, .5)*maxWord)|0;
            k[primeCounter++] = (mathPow(candidate, 1/3)*maxWord)|0;
        }
    }

    ascii += '\x80'; // Append '1' bit (plus zero padding)
    while (ascii[lengthProperty]%64 - 56) ascii += '\x00'; // More zero padding
    for (i = 0; i < ascii[lengthProperty]; i++) {
        j = ascii.charCodeAt(i);
        if (j>>8) return; // ASCII check: only accept characters in range 0-255
        words[i>>2] |= j << ((3 - i)%4)*8;
    }
    words[words[lengthProperty]] = ((asciiBitLength/maxWord)|0);
    words[words[lengthProperty]] = (asciiBitLength)

    // process each chunk
    for (j = 0; j < words[lengthProperty];) {
        var w = words.slice(j, j += 16); // The message is expanded into 64 words as part of the iteration
        var oldHash = hash;
        // This is now the "working hash", often labelled as variables a...g
        // (we have to truncate as well, otherwise extra entries at the end accumulate
        hash = hash.slice(0, 8);

        for (i = 0; i < 64; i++) {
            var i2 = i + j;
            // Expand the message into 64 words
            // Used below if
            var w15 = w[i - 15], w2 = w[i - 2];

            // Iterate
            var a = hash[0], e = hash[4];
            var temp1 = hash[7]
                + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) // S1
                + ((e&hash[5])^((~e)&hash[6])) // ch
                + k[i]
                // Expand the message schedule if needed
                + (w[i] = (i < 16) ? w[i] : (
                        w[i - 16]
                        + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15>>>3)) // s0
                        + w[i - 7]
                        + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2>>>10)) // s1
                    )|0
                );
            // This is only used once, so *could* be moved below, but it only saves 4 bytes and makes things unreadble
            var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) // S0
                + ((a&hash[1])^(a&hash[2])^(hash[1]&hash[2])); // maj

            hash = [(temp1 + temp2)|0].concat(hash); // We don't bother trimming off the extra ones, they're harmless as long as we're truncating when we do the slice()
            hash[4] = (hash[4] + temp1)|0;
        }

        for (i = 0; i < 8; i++) {
            hash[i] = (hash[i] + oldHash[i])|0;
        }
    }

    for (i = 0; i < 8; i++) {
        for (j = 3; j + 1; j--) {
            var b = (hash[i]>>(j*8))&255;
            result += ((b < 16) ? 0 : '') + b.toString(16);
        }
    }
    return result;
}
