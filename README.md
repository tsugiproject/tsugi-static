
This holds the static files used by the Tsugi framework.  This is shared between the
Tsugi implementations in various languages.

You can check this out locally into the htdocs folder next to your Tsugi
developer console (/tsugi) or just use the copy stored in the CloudFlare CDN at:

    https://www.dr-chuck.net/tsugi-static
    
If you don't specify the `staticroot` in `config.php` it will use the above
URL to serve static content.  If you want to serve it locally if you are on 
a plane or behind a firewall check it out and then set the configuration similar
to the following:

    $CFG->staticroot = 'http://localhost/tsugi-static';  /// For normal
    $CFG->staticroot = 'http://localhost:8888/tsugi-static';   // For MAMP
    $CFG->staticroot = "https://tsugi.mylearn.com/tsugi-static"; 

Or something similar.
