/**
 * @license Copyright (c) 2003-2017, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or http://ckeditor.com/license
 */

CKEDITOR.editorConfig = function( config ) {
	// Define changes to default configuration here.
	// For complete reference see:
	// http://docs.ckeditor.com/#!/api/CKEDITOR.config

	// The toolbar groups arrangement, optimized for two toolbar rows.
	config.toolbarGroups = [
		{ name: 'clipboard',   groups: [ 'clipboard', 'undo' ] },
		{ name: 'editing',     groups: [ 'find', 'selection', 'spellchecker' ] },
		{ name: 'links' },
		{ name: 'insert' },
		{ name: 'forms' },
		{ name: 'tools' },
		{ name: 'document',	   groups: [ 'mode', 'document', 'doctools' ] },
		{ name: 'others' },
		'/',
		{ name: 'basicstyles', groups: [ 'basicstyles', 'cleanup' ] },
		{ name: 'paragraph',   groups: [ 'list', 'indent', 'blocks', 'align', 'bidi' ] },
		{ name: 'styles' },
		{ name: 'colors' },
		{ name: 'about' }
	];

	// Remove some buttons provided by the standard plugins, which are
	// not needed in the Standard(s) toolbar.
	config.removeButtons = 'Underline,Subscript,Superscript';

	// Set the most common block elements.
	config.format_tags = 'p;h1;h2;h3;pre';

	// Simplify the dialog windows.
	config.removeDialogTabs = 'image:advanced;link:advanced';

    // Remove the more complex plugins by default - HTML only
    config.removePlugins = 'bbcode,mathjax,markdown';

    // Added: Tsugi Override configuration
    /*
        <script>
            var CK_OVERRIDE_CONFIG = { };
            CK_OVERRIDE_CONFIG.removePlugins = 'mathjax,markdown'; // Keep bbcode
            CK_OVERRIDE_CONFIG.language = 'es';
            CK_OVERRIDE_CONFIG.uiColor = '#F7B42C';
            CK_OVERRIDE_CONFIG.height = 300;
            CK_OVERRIDE_CONFIG.toolbarCanCollapse = true;
        </script>
        <script src="../ckeditor.js"></script>
     */
    if ( typeof CK_OVERRIDE_CONFIG != 'undefined' ) {
        // console.log(CK_OVERRIDE_CONFIG);
        for (var key in CK_OVERRIDE_CONFIG) {
            if (CK_OVERRIDE_CONFIG.hasOwnProperty(key)) {
                config[key] = CK_OVERRIDE_CONFIG[key];
            }
        }
        // config.removePlugins = CK_OVERRIDE_CONFIG;
    }

};
