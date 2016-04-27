<html>
<head>
<title>
Tsugi Static Files (Cross-Language)
</title>
</head>
<body style="font-family: sans-serif;">
<h1>Tsugi Static Files (Cross-Language)</h1>
<p>
This is part of the 
<a href="https://github.com/csev/tsugi" target="_blank">Tsugi Project</a>.
This holds the static files used by the Tsugi framework.  
These files are shared between the
Tsugi implementations in various languages.
</p>
<p>
You can check this out locally into the <code>htdocs</code> folder next 
to your Tsugi
developer console <code>(/tsugi)</code> or just use the copy stored 
in the CloudFlare CDN at:
<pre>
    https://www.dr-chuck.net/tsugi-static
</pre> 
</p>
<p>
If you don't specify the <code>staticroot</code> in your Tsugi <code>config.php</code> 
it will use the above
URL to serve static content.  If you want to serve it locally if you are on 
a plane or behind a firewall check it out and then set the configuration similar
to the following:
<pre>
    $CFG->staticroot = 'http://localhost/tsugi-static';  /// For normal
    $CFG->staticroot = 'http://localhost:8888/tsugi-static';   // For MAMP
    $CFG->staticroot = "https://www.my-awesome-learning-tool.com/tsugi-static"; 
</pre>
Or something similar.
</p>
</body>
</html>
