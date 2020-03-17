(function ($)
    {
        /**
         * Auto-growing textareas; technique ripped from Facebook
         *
         * https://github.com/jaz303/jquery-grab-bag/tree/master/javascripts/jquery.autogrow-textarea.js
         */
        $.fn.autogrow = function (options)
        {
            return this.filter('textarea').each(function ()
                {
                    var self = this;
                    var $self = $(self);
                    var minHeight = $self.height();
                    var noFlickerPad = $self.hasClass('autogrow-short') ? 0 : parseInt($self.css('lineHeight')) || 0;

                    var shadow = $('<div></div>').css({
                        position: 'absolute',
                        top: -10000,
                        left: -10000,
                        width: $self.width(),
                        fontSize: $self.css('fontSize'),
                        fontFamily: $self.css('fontFamily'),
                        fontWeight: $self.css('fontWeight'),
                        lineHeight: $self.css('lineHeight'),
                        resize: 'none',
                        'word-wrap': 'break-word' }).
                        appendTo(document.body);

                    var update = function (event)
                    {
                        var times = function (string, number)
                        {
                            for (var i = 0, r = ''; i < number; i++) {if (window.CP.shouldStopExecution(0)) break;r += string;}window.CP.exitedLoop(0);
                            return r;
                        };

                        var val = self.value.replace(/</g, '&lt;').
                            replace(/>/g, '&gt;').
                            replace(/&/g, '&amp;').
                            replace(/\n$/, '<br/>&nbsp;').
                            replace(/\n/g, '<br/>').
                            replace(/ {2,}/g, function (space) {return times('&nbsp;', space.length - 1) + ' ';});

                        // Did enter get pressed?  Resize in this keydown event so that the flicker doesn't occur.
                        if (event && event.data && event.data.event === 'keydown' && event.keyCode === 13) {
                            val += '<br />';
                        }

                        shadow.css('width', $self.width());
                        shadow.html(val + (noFlickerPad === 0 ? '...' : '')); // Append '...' to resize pre-emptively.
                        $self.height(Math.max(shadow.height() + noFlickerPad, minHeight));
                    };

                    $self.change(update).keyup(update).keydown({ event: 'keydown' }, update);
                    $(window).resize(update);

                    update();
                });
        };
    })(jQuery);


var PostITator = {
    options : {} ,
    noteTemp : '<div class="note">' +
'<a href="javascript:;" class="button PostITator-remove">X</a>' +
'<div class="note_cnt">' +
'<textarea class="cnt" placeholder="Enter note"></textarea>' +
'</div> ' +
'</div>',

    noteZindex : 1,
    deleteNote : function () {
        if ( PostITator.options.onDelete ) {
            PostITator.options.onDelete($(this).parent('.note').attr('id'));
        }
        // $(this).parent('.note').hide("puff", { percent: 133 }, 250);
        // $(this).parent('.note').hide("puff", { percent: 133 }, 250).remove();
        $(this).parent('.note').remove();
        PostITator.lastTop = 0;
        PostITator.lastLeft = 0;
    },

    // https://stackoverflow.com/a/2117523/1994792
    uuidv4: function () {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    newNote: function (event) {
        var id = false;
        var top = $(document).scrollTop() + 20;
        var left = 20;
        PostITator.addNote(id, top, left);
        return false;
    },

    lastTop: 0,
    lastLeft: 0,
    addNote: function (id=false, top=false, left=false, text=false) {
        // console.log('begin', top, left, PostITator.lastTop.lastTop, PostITator.lastTop.lastleft);
        var current = false;
        $('.current').each(function(i, obj) {
            if ( ! current ) current = obj;
        });

        if ( current && PostITator.lastTop == top && PostITator.lastLeft == left ) {
            top = current.offsetTop + 20;
            left = current.offsetLeft + 20;
        } else {
            PostITator.lastTop = top;
            PostITator.lastLeft = left;
        }
        // console.log('end', top, left);

        $('.current').removeClass('current');

        if ( ! id ) id = PostITator.uuidv4();
        if ( ! text ) text = '';
        // console.log('newNote', id, top, left, text);
        $(PostITator.noteTemp).attr('id', id).css('top', top).css('left', left).css('position', 'absolute')
        .addClass('current').hide().appendTo("#board").show("fade", 300)
        .zIndex(++PostITator.noteZindex)
        .draggable().on('dragstart',
            function () {
                $(this).zIndex(++PostITator.noteZindex);
            }).on('dragstop', function() {
                console.log('this', this);
                var id = this.id;
                var top = this.offsetTop;
                var left = this.offsetLeft;
                var text = $(this).find('textarea')[0].value;
                if ( PostITator.options.onChange ) {
                    PostITator.options.onChange(id, top, left, text);
                }
            }).find('textarea')[0].value = text;

        $('.PostITator-remove').click(PostITator.deleteNote);

        $('#'+id).find('textarea').autogrow().on('change', function() {
            var elem = document.getElementById(id);
            var top = elem.offsetTop;
            var left = elem.offsetLeft;
            var text = this.value;
            if ( PostITator.options.onChange ) {
                PostITator.options.onChange(id, top, left, text);
            }
        });
    },

    nextNote: function () {
        PostITator.moveNote(true);
    },

    prevNote: function () {
        PostITator.moveNote(false);
    },

    moveNote : function (forward) {
        var sct = $(document).scrollTop();
        var current = false;
        $('.current').each(function(i, obj) {
            if ( ! current ) current = obj;
        });
        var currentpos = 0;
        if ( current ) {
            currentpos = (current.offsetTop * 5000 ) + current.offsetLeft;
            // currentpos = current.offsetTop;
        }
        var first = false;
        var firstpos = false;
        var last = false;
        var lastpos = false;
        var prev = false;
        var prevpos = false;
        var next = false;
        var nextpos = false;
        $('.note').each(function(i, obj) {
            var pos = (obj.offsetTop * 5000 ) + obj.offsetLeft;
            // pos = obj.offsetTop ;
            // console.log(pos, 'fpcnl', firstpos,prevpos,currentpos,nextpos,lastpos);
            if ( ! lastpos || pos > lastpos ) {
                last = obj;
                lastpos = pos;
            }
            if ( ! firstpos || pos < firstpos ) {
                first = obj;
                firstpos = pos;
            }
            if ( pos < currentpos && (pos > prevpos || !prevpos) ) {
                prev = obj
                prevpos = pos;
            }
            if ( pos > currentpos && (pos < nextpos || !nextpos) ) {
                next = obj
                nextpos = pos;
            }
        });
        // console.log(forward, 'fpcnl', firstpos,prevpos,currentpos,nextpos,lastpos);

        if ( ! next ) next = first;
        if ( ! prev ) prev = last;

        if ( forward && next ) {
            next.scrollIntoView({ behavior: 'smooth' });
            $(next).addClass('current');
        }
        if ( ! forward && prev ) {
            prev.scrollIntoView({ behavior: 'smooth' });
            $(prev).addClass('current');
        }
        if ( current ) $(current).removeClass('current');
    },

    onDelete : function(id) {
        console.log('onDelete', id);
        if ( PostITator.options.service ) {
            $.ajax({
                type: 'DELETE',
                url: PostITator.options.service + '/' + id,
            }).fail(function (msg) {
                console.log('onDelete FAIL '+msg.status);
            });
        }
    },

    onChange : function(id, top, left, text) {
        console.log('onChange', id, top, left, text);
        if ( PostITator.options.service ) {
            let data = {"id":id, "top":top, "left":left, "text": text}

            $.ajax({
                type: 'POST',
                url: PostITator.options.service,
                contentType: 'application/json',
                data: JSON.stringify(data), // access in body
            }).fail(function (msg) {
                console.log('onChange FAIL'+msg.status);
            });
        }
    },

    deleteAll : function() {
        console.log('deleteAll');
        $('.note').remove();
        if ( PostITator.options.service ) {
            $.ajax({
                type: 'DELETE',
                url: PostITator.options.service,
            }).fail(function (msg) {
                console.log('deleteAll FAIL '+msg.status);
            });
        }
    },


    loadNotes : function() {
        console.log('loadNotes');
        if ( PostITator.options.service ) {
            $.ajax({
                type: 'GET',
                url: PostITator.options.service,
            }).done(function (data) {
                console.log('loadNotes SUCCESS');
                for(var i=0; i< data.length; i++) {
                    var note = data[i];
                    PostITator.addNote(note.id, note.top, note.left, note.text);
                }
            }).fail(function (msg) {
                console.log('loadNotes FAIL '+msg.status);
            });
        }
    },
};


