<!DOCTYPE html>
<html>
	<head>
		<link rel="stylesheet" type="text/css" href="<?php echo site_url('static/css/layout.css'); ?>" />
		<link rel="stylesheet" type="text/css" href="<?php echo site_url('static/css/button.css'); ?>" />
		<link rel="stylesheet" type="text/css" href="<?php echo site_url('static/css/jPicker.css'); ?>" />
		<link rel="stylesheet" type="text/css" href="<?php echo site_url('static/css/jPicker-1.1.6.min.css'); ?>" />
		
		<script type="text/javascript" src="<?php echo site_url('static/js/jquery.min.js') ?>"></script>
		<script type="text/javascript" src="<?php echo site_url('static/js/jpicker-1.1.6.min.js') ?>"></script>
		<script type="text/javascript" src="<?php echo $ws_url . 'socket.io/socket.io.js'; ?>"></script>
		<script type="text/javascript" src="<?php echo site_url('static/js/nrcwhiteboard.js'); ?>"></script>
		
		<style>
			body {
				overflow: hidden;
				background-color: #EFEFEF;
			}
		
			#header {
				position: relative;
				left: 0;
				right: 0;
				z-index: 5;
				background-color: #EFEFEF;
				border-bottom: 1px solid #CCC;
			}
			
			#header ul {
				list-style-type: none;
				margin: 0;
				padding: 0;
			}
			
			#header ul li {
				display: inline;
			}
			
			#canvas {
				background-color: #EFEFEF;
				overflow: hidden;
			}
			
			#users {
				z-index: 5;
				position: absolute;
				right: 0;
				top: 0;
				width: 150px;
				background-color: #EFEFEF;
				border-left: 1px solid #CCC;
			}
			
			#users ul {
				list-style-type: none;
				margin: 0;
				padding: 0;
			}
			
			#users ul li {
				padding: 3px;
			}
			
			#status {
				border-top: 1px solid #CCC;
				border-bottom: 1px solid #CCC;
				text-align: center;
				padding: 5px 0 5px 0;
				margin-bottom: 10px;
				background-color: #FF5656;
			}
			
			#chat {
				z-index: 5;
				position: relative;
				height: 150px;
				border-top: 1px solid #CCC;
			}
			
			#chat input {
				height: 30px;
				border: none;
				font-size: 1em;
			}
			
			#chat_messages {
				border-bottom: 1px solid #CCC;
				height: 115px;
				background-color: #FFF;
				overflow: auto;
			}
			
			#chat_messages ul {
				list-style-type: none;
				margin: 0;
				padding: 0;
			}
		</style>
		<script type="text/javascript">
			/* http://www.arstdesign.com/articles/autolink.html */
			function autolink(s) {   
			   	var hlink = /\s(ht|f)tps?:\/\/([^ \,\;\:\!\)\(\"\'\<\>\f\n\r\t\v])+/g;
			   	return (s.replace (hlink, function ($0,$1,$2) { s = $0.substring(1,$0.length); 
			   		// remove trailing dots, if any
			        while (s.length>0 && s.charAt(s.length-1)=='.') 
                    	s=s.substring(0,s.length-1);
                    // add hlink
                    return " " + '<a href="'+s+'" target="_blank">'+s+'</a>'; 
                }));
			}
		
			$(document).ready( function() {
				var CHAT_ME_NAME = 'Me';
				var CHAT_ME_STYLE = '#000';
				var CHAT_ME = '<span style="color:'+CHAT_ME_STYLE+'">'+CHAT_ME_NAME+'</span>:';	
				
				document.onselectstart = function(e){return false;};
				
				$(window).resize( function() {								
					$('#canvas').width( $(this).width() - $('#users').width() );
					$('#canvas').height( $(this).height() - $('#header').height() - $('#chat').height() - 1 );
					
					$('#users').height( $(this).height() - $('#header').height() - $('#chat').height() );
					$('#users').css('top', $('#header').height() );
					
					$('#tool_chat_input').width( $(this).width() - $('#tool_chat').width() - 10);
				});
				$(window).resize();
								
				$('button.tools').click( function() {	
					// activate the right button, failback to select tool				
					if( $(this).hasClass('active') ) {
						$('button.tools').removeClass('active');
						$('#tool_select').addClass('active');
					}
					else {
						$('button.tools').removeClass('active');
						$(this).addClass('active');
					}
					
					// Set the current whiteboard tool
					switch( $('button.tools.active').attr('id') ) {
						case 'tool_select':
							NRCWhiteboard.setTool(NRCWhiteboard.TOOL_SELECT);
							break;
							
						case 'tool_hand':
							NRCWhiteboard.setTool(NRCWhiteboard.TOOL_HAND);
							break;
							
						case 'tool_rect':
							NRCWhiteboard.setTool(NRCWhiteboard.TOOL_RECT);
							break;
							
						case 'tool_ellipse':
							NRCWhiteboard.setTool(NRCWhiteboard.TOOL_ELLIPSE);
							break;
						
						case 'tool_triangle':
							NRCWhiteboard.setTool(NRCWhiteboard.TOOL_TRIANGLE);
							break;
							
						case 'tool_rtriangle':
							NRCWhiteboard.setTool(NRCWhiteboard.TOOL_RTRIANGLE);
							break;
							
						case 'tool_line':
							NRCWhiteboard.setTool(NRCWhiteboard.TOOL_LINE);
							break;
							
						case 'tool_text':
							NRCWhiteboard.setTool(NRCWhiteboard.TOOL_TEXT);
							break;
							
						case 'tool_brush':
							NRCWhiteboard.setTool(NRCWhiteboard.TOOL_BRUSH);
							break;
							
						case 'tool_poly':
							NRCWhiteboard.setTool(NRCWhiteboard.TOOL_POLY);
							break;
							
						default:
							break;
					}	
				});
				
				$('#tool_remove').click( function() {
					NRCWhiteboard.remove();
				});
				
				$('#tool_clear').click( function() {
					NRCWhiteboard.clear();
				});
				
				$('#width-picker').change( function() {
					NRCWhiteboard.setLineWidth(parseInt($(this).val()));
				});
				
				// The color pickers
				$('#stroke-picker').jPicker({
					window: {
						expandable: true,
						title: 'Stroke Color',
						position: {
							x: '0',
							y: '0'
						},
						alphaSupport: true
					},
					images: {
						clientPath: '/static/img/'
					},
					color: {
						active: new $.jPicker.Color({hex: '#000000'})
					}
				},
				function(color, context) {	
					NRCWhiteboard.setStrokeStyle('#'+color.val('hex'), color.val('a')/255);
				},
				function(color, context) {
					//NRCWhiteboard.setStrokeStyle('#'+color.val('hex'), color.val('a')/255);
				});
				
				$('#fill-picker').jPicker({
					window: {
						expandable: true,
						title: 'Fill Color',
						position: {
							x: '0',
							y: '0'
						},
						alphaSupport: true
					},
					images: {
						clientPath: '/static/img/'
					},
					color: {
						active: new $.jPicker.Color({hex: '#FFFFFF'})
					}
				},
				function(color, context) {
					NRCWhiteboard.setFillStyle('#'+color.val('hex'), color.val('a')/255);
				},
				function(color, context) {
					//NRCWhiteboard.setFillStyle('#'+color.val('hex'), color.val('a')/255);
				});
				
				$('#font-family-picker').change( function() {
					NRCWhiteboard.setFontFamily($(this).val());
				});
				
				$('#font-size-picker').change( function() {
					NRCWhiteboard.setFontSize(parseInt($(this).val()));
				});
				
				$('button.font-tools').click( function() {
					if( $(this).hasClass('active') ) {
						if( !$(this).hasClass('font-align') ) {
							$(this).removeClass('active');
						}
					}
					else {
						if( $(this).hasClass('font-align') ) {
							$('button.font-align').removeClass('active');
						}
						$(this).addClass('active');
					}
					
					switch( $(this).attr('id') ) {
						case 'tool_bold':
							NRCWhiteboard.toggleBold();
							break
						case 'tool_italic':
							NRCWhiteboard.toggleItalic();
							break;
						case 'tool_underline':
							NRCWhiteboard.toggleUnderline();
							break;
						case 'tool_left':
							NRCWhiteboard.setFontAlign('left');
							break;
						case 'tool_center':
							NRCWhiteboard.setFontAlign('center');
							break;
						case 'tool_right':
							NRCWhiteboard.setFontAlign('right');
							break;
						default:
							break;
					}
				});
				
				$('#font-picker').jPicker({
					window: {
						expandable: true,
						title: 'Text Color',
						position: {
							x: '0',
							y: '0'
						},
						alphaSupport: true
					},
					images: {
						clientPath: '/static/img/'
					},
					color: {
						active: new $.jPicker.Color({hex: '#000000'})
					}
				},
				function(color, context) {
					NRCWhiteboard.setFontStyle('#'+color.val('hex'), color.val('a')/255);
				},
				function(color, context) {
					//NRCWhiteboard.setFontStyle('#'+color.val('hex'), color.val('a')/255);
				});
				
				$('#tool_grid').click( function() {
					if( $(this).hasClass('active') ) {
						$(this).removeClass('active');
					}
					else {
						$(this).addClass('active');
					}
					
					NRCWhiteboard.toggleGrid();
				});
				
				$('#grid-picker').change( function() {
					NRCWhiteboard.setGridWidth(parseInt($(this).val()));
				});
				
				$('#tool_undo').click( function() {
					NRCWhiteboard.undo();
				});
				
				$('#tool_redo').click( function() {
					NRCWhiteboard.redo();
				});
				
				$('#tool_back').click( function() {
					NRCWhiteboard.sendToBack();
				});
				
				$('#tool_front').click( function() {
					NRCWhiteboard.sendToFront();
				});
				
				$('#tool_copy').click( function() {
					NRCWhiteboard.copy();
					NRCWhiteboard.paste();
				});
				
				$('#tool_selectall').click( function() {
					NRCWhiteboard.selectAll();
					
					$('#tool_select').click();
				});
				
				$('#tool_convert').click( function() {
					var image_data = NRCWhiteboard.convertToPNG();
					
					top.image_window = window.open('', 'myimage', 
						'width=800' +
						',height=600' +
						',menubar=0' +
						',toolbar=1' +
						',status=0' +
						',scrollbars=1' +
						',resizable=1'
					);
					
					top.image_window.document.writeln(
						'<html><head><title>PNG of Canvas</title></head>' +
						'<body onLoad="self.focus();">' +
						'<img src="'+image_data+'" alt="Export of Canvas" />' +
						'</body></html>'
					);
					
					top.image_window.document.close();
				});		
				
				$('#tool_image').click( function(e) {
					var url = $('#tool_image_input').val().trim();
					
					if( url !== '' ) {
						var xhr = new XMLHttpRequest();
						xhr.open('GET', '<?php echo site_url("whiteboard/proxy?url="); ?>' + encodeURIComponent(url), false);

						xhr.onload = function() {										
							if( this.status == 200 ) {																								
								NRCWhiteboard.addImage('<?php echo site_url("whiteboard/proxy?url="); ?>' + encodeURIComponent(url));
							}
							else {								
								NRCWhiteboard.addImage('<?php echo site_url("static/img/broken.jpeg"); ?>');
							}
						}
						
						xhr.send();
					}
				});
				
				$('#tool_identify').click( function(e) {
					var name = $('#tool_identify_input').val().trim();
					
					if( name !== '' ) {
						NRCWhiteboard.identify(name);
						
						CHAT_ME_NAME = name;
						CHAT_ME = '<span style="color:'+CHAT_ME_STYLE+'">'+CHAT_ME_NAME+'</span>:';
						
						$('#users ul li:first').html(name);
						
						$('#tool_identify_input').val('');
					}
				});
				
				$('#tool_chat').click( function() {
					var msg = $('#tool_chat_input').val().trim();
					
					if( msg !== '' ) {
						NRCWhiteboard.chat(msg);
						
						var html = '<li>' + CHAT_ME + ' ' + msg + '</li>';
						
						$('#chat_messages ul').append(autolink(html));
						$('#chat_messages').scrollTop($('#chat_messages').height() + 1000);
						$('#tool_chat_input').val('');
					}
				});
				
				$('#tool_stick').click( function() {
					NRCWhiteboard.toggleStickToGrid();
				});
				
				$('#tool_chat_input').keydown( function(e) {
					if( e.which == 13 ) {
						$('#tool_chat').click();
					}
				});
				
				// The Canvas	
				NRCWhiteboard.init({
					'canvas': 'canvas',
					'socket': '<?php echo $ws_url; ?>',
					'width': 2000,
					'height': 2000,
					'key': "<?php echo $key; ?>",
					'onselection': function(object) {
						var v = $.jPicker.ColorMethods.hexToRgba(object.stroke_style);
						v.a = object.stroke_alpha*255;
						$.jPicker.List[0].color.active.val('rgba', v);
						
						v = $.jPicker.ColorMethods.hexToRgba(object.fill_style);
						v.a = object.fill_alpha*255;
						$.jPicker.List[1].color.active.val('rgba', v);
						
						if( object.class_name == 'TextObject' ) {
							v = $.jPicker.ColorMethods.hexToRgba(object.font_style);
							v.a = object.font_alpha*255;
							$.jPicker.List[2].color.active.val('rgba', v);
							
							$('#font-family-picker > option[value="'+object.font_family.toLowerCase()+'"]').attr('selected', 'selected');
							$('#font-size-picker > option[value='+object.font_size+']').attr('selected', 'selected');
							
							$('#tool_bold').removeClass('active');
							if( object.font_bold ) {
								$('#tool_bold').addClass('active');
							}
							
							$('#tool_italic').removeClass('active');
							if( object.font_italic ) {
								$('#tool_italic').addClass('active');
							}
							
							$('#tool_underline').removeClass('active');
							if( object.font_underline ) {
								$('#tool_underline').addClass('active');
							}
							
							$('button.font-align').removeClass('active');
							
							switch( object.font_align ) {
								case 'left':
									$('#tool_left').addClass('active');
									break;
								case 'center':
									$('#tool_center').addClass('active');
									break;
								case 'right':
									$('#tool_right').addClass('active');
									break;
								default:
									break;
							}
						}
												
						$('#width-picker > option[value='+object.line_width+']').attr('selected', 'selected');
					},
					'ondeselection': function(object) {
						// pass
					},
					'oncanvasmove': function() {
						var coords = NRCWhiteboard.getCanvasOrigin();
						$('#origin_x').html(coords.x);
						$('#origin_y').html(coords.y);
					},
					'onuserjoin': function(object) {						
						if( $('#user_'+object['slot']).length == 0 ) {
							var html = '<li id="user_'+object['slot']+'" style="color:'+object['color']+'">'+object['name']+'</li>';

							if( object['owner'] == true ) {
								$('#users ul').prepend(html);

								$('#status').html('Connected!');
								$('#status').css('background-color', '#AAFF56');

								CHAT_ME_NAME = object['name'];
								CHAT_ME_STYLE = object['color'];
								CHAT_ME = '<span style="color:'+CHAT_ME_STYLE+'">'+CHAT_ME_NAME+'</span>:';
							}
							else {
								$('#users ul').append(html);
							}
						}
						else {
							$('#user_'+object['slot']).html(object['name']);
						}
					},
					'onuserdisconnect': function(object) {
						if( object['owner'] == true ) {
							$('#status').html('Connecting ...');
							$('#status').css('background-color', '#FF5656');
							$('#users ul li').remove();
						}
						else {
							$('#user_'+object['slot']).remove();
						}
					},
					'onchat': function(object) {			
						var html = '<li><span style="color:'+object['color']+'">'+object['name']+'</span>: ' + object['msg'] + '</li>';
						$('#chat_messages ul').append(autolink(html));
						$('#chat_messages').scrollTop($('#chat_messages').height() + 1000);
					}
				});	
				
				window.addEventListener("copy", function(e) {
					if( e.target.localName == "body" ) {
						NRCWhiteboard.copy();
					}	
				}, false);

				window.addEventListener("paste", function(e) {
					if( e.target.localName == "body" ) {
						NRCWhiteboard.paste();
					}
				}, false);

				window.addEventListener("keydown", function(e) {	
					if( e.target.localName == "body" ) {
						if( e.which == 46 ) {
							NRCWhiteboard.remove();
						}
					}
				}, false);
				
				window.addEventListener("resize", function(e) {
					var canvas = document.getElementById('canvas').getElementsByTagName('canvas')[0];
					
					/*canvas_initial_offset_top = canvas.offsetTop;
					if( canvas.style.marginTop != '' ) {
						canvas_initial_offset_top += Math.abs(parseInt(canvas.style.marginTop));
					}

					canvas_initial_offset_left = canvas.offsetLeft;
					if( canvas.style.marginLeft != '' ) {
						canvas_initial_offset_left += Math.abs(parseInt(canvas.style.marginLeft));
					}*/

					NRCWhiteboard.resetCanvasPosition();

					e.preventDefault();
				}, false);
				
				document.getElementById('canvas').addEventListener("dragover", function (e) {
					e.preventDefault();
				}, false);

				document.getElementById('canvas').addEventListener("drop", function (e) {	
					if( e.dataTransfer.files.length > 0 ) {
						for( var i = 0; i < e.dataTransfer.files.length; i++ ) {
							var file = e.dataTransfer.files[i];

							if( /^image/.test(file.type) ) {
								var xhr = new XMLHttpRequest();
								xhr.open('POST', '<?php echo site_url("whiteboard/proxy?url="); ?>', false);

								// x-form-data is a hack!
								xhr.setRequestHeader('Content-Type', 'multipart/x-form-data');
								xhr.setRequestHeader('X-File-Name', file.fileName);
								xhr.setRequestHeader('X-File-Size', file.fileSize);
								xhr.setRequestHeader('X-File-Type', file.type);

								xhr.onload = function() {
									if( this.status == 200 ) {
										NRCWhiteboard.setMousePosition(e.pageX, e.pageY);
										NRCWhiteboard.addImage(this.responseText, 10*i, 10*i);
									}
									else {
										NRCWhiteboard.setMousePosition(e.pageX, e.pageY);
										NRCWhiteboard.addImage('<?php echo site_url("static/img/broken.jpeg"); ?>', 10*i, 10*i);
									}
								}

								xhr.send(file);
							}
						}
					}
					else {
						if( e.dataTransfer.types.indexOf("text/html") != -1 ) {
							var html = e.dataTransfer.getData('text/html');
							var src = html.match(/<img src="([^\""]+)"/);

							if( src != null && src.length > 1 ) {	
								var xhr = new XMLHttpRequest();
								xhr.open('GET', '<?php echo site_url("whiteboard/proxy?url="); ?>' + encodeURIComponent(src[1]), false);

								xhr.onload = function() {			
									if( this.status == 200 ) {										
										NRCWhiteboard.setMousePosition(e.pageX, e.pageY);
										NRCWhiteboard.addImage('<?php echo site_url("whiteboard/proxy?url="); ?>' + encodeURIComponent(src[1]));
									}
									else {
										NRCWhiteboard.setMousePosition(e.pageX, e.pageY);
										NRCWhiteboard.addImage('<?php echo site_url("static/img/broken.jpeg"); ?>');
									}
								}
								
								xhr.send();
							}
						}
					}	
					e.preventDefault();
				}, false);
			});
		</script>
	</head>
	<body>
		<div id="header">
			<div class="left">
				<ul>
					<li><button id="tool_select" class="tools small active">Select</button></li>
					<li><button id="tool_hand" class="tools small">Hand</button></li>
					<li><button id="tool_rect" class="tools small">Rect.</button></li>
					<li><button id="tool_ellipse" class="tools small">Ellipse</button></li>
					<li><button id="tool_triangle" class="tools small">Tri.</button></li>
					<li><button id="tool_rtriangle" class="tools small">R. Tri.</button></li>
					<li><button id="tool_line" class="tools small">Line</button></li>
					<li><button id="tool_text" class="tools small">Text</button></li>
					<li><button id="tool_brush" class="tools small">Brush</button></li>
					<li><button id="tool_poly" class="tools small">Poly</button></li>					
					<li>Width: 
						<select id="width-picker">
							<option value="2">2</option>
							<option value="4">4</option>
							<option value="6">6</option>
							<option value="8">8</option>
							<option value="10">10</option>
						</select>
					</li>
					<li>Stroke: <span id="stroke-picker"></span></li>
					<li>Fill: <span id="fill-picker"></span></li>
				</ul>
				<ul>
					<li>
						<select id="font-family-picker">
							<option value="arial">Arial</option>
							<option value="courier">Courier</option>
							<option value="courier new">Courier New</option>
							<option value="geneva">Geneva</option>
							<option value="georgia">Georgia</option>
							<option value="helvetica" selected="selected" >Helvetica</option>
							<option value="times new roman">Times New Roman</option>
							<option value="times">Times</option>
							<option value="verdana">Verdana</option>
						</select>
					</li>
					<li>
						<select id="font-size-picker">
							<option value="8">8</option>
							<option value="9">9</option>
							<option value="10">10</option>
							<option value="11">11</option>
							<option value="12" selected="selected" >12</option>
							<option value="14">14</option>
							<option value="16">16</option>
							<option value="18">18</option>
							<option value="20">20</option>
							<option value="22">22</option>
							<option value="24">24</option>
							<option value="26">26</option>
							<option value="28">28</option>
							<option value="36">36</option>
							<option value="48">48</option>
							<option value="72">72</option>
						</select>
					</li>
					<li><button id="tool_bold" class="font-tools small">B</button></li>
					<li><button id="tool_italic" class="font-tools small">I</button></li>
					<li><button id="tool_underline" class="font-tools small">U</button></li>
					<li>Text: <span id="font-picker"></span></li>
					<li><button id="tool_left" class="font-tools font-align small">Left</button></li>
					<li><button id="tool_center" class="font-tools font-align active small">Cen.</button></li>
					<li><button id="tool_right" class="font-tools font-align small">Right</button></li>
				</ul>
				<ul>
					<li><button id="tool_back" class="medium">Send to Back</button></li>
					<li><button id="tool_front" class="medium">Send to Front</button></li>
					<li><button id="tool_grid" class="small">Grid</button></li>
					<li>Spacing: 
						<select id="grid-picker">
							<option value="10">10</option>
							<option value="20">20</option>
							<option value="50">50</option>
							<option value="100" selected="selected">100</option>
						</select>
					</li>
					<li><button id="tool_stick" class="font-tools small">Sticky</button></li>
					<li>Origin: <span id="origin_x">0</span>, <span id="origin_y">0</span></li>
				</ul>
			</div>
			<div class="right text-right">
				<ul>
					<li><button id="tool_undo" class="small">Undo</button></li>
					<li><button id="tool_redo" class="small">Redo</button></li>
					<li><button id="tool_remove" class="small">Remove</button></li>
					<li><button id="tool_clear" class="small">Clear</button></li>
				</ul>
				<ul>
					<li><button id="tool_selectall" class="medium">Select All</button></li>
					<li><button id="tool_copy" class="medium">Copy/Paste</button></li>
					<li><button id="tool_convert" class="medium">Convert to PNG</button></li>
				</ul>
				<ul>
					<li>
						<input id="tool_image_input" type="text" /><button id="tool_image" class="medium">Add Image</button>
					</li>
				</ul>
			</div>
			<br class="clear" />
		</div>
		<div id="canvas"></div>
		<div id="users">
			<div id="status">Connecting ...</div>
			<center>
				<b><u>Users</u></b>
			</center>
			<ul></ul>
			<hr />
			<div>
				<input id="tool_identify_input" type="text" />
				<button id="tool_identify" class="medium">Change Name</button>
			</div>
		</div>
		<div id="chat">
			<div id="chat_messages">
				<ul>
					<li>*** NRCWhiteboard Chat ***</li>
				</ul>
			</div>
			<input id="tool_chat_input" type="text" /> <button id="tool_chat" class="medium">Send</button>
		</div>
	</body>
</html>