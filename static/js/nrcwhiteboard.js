//*****************************************************************************/
//	NRCSocket
//*****************************************************************************/

(function( NRCSocket, io ) {
	var debug = false;
	var socket = null;
	var host = '';
	var ping_interval = null;
	var onopen_callback = function(){ return; };
	var onmessage_callback = function(){ return; };
	var onclose_callback = function(){ return; };

	/*
		Currently accepted params:
			Required:
				host: the web socket url || null
		
			Optional:
				debug: <true|false>, // controls logging output
				onopen: <callback function>,
				onmessage: <callback function>,
				onclose: <callback function>
	*/
	NRCSocket.init = function(params) {		
		if( typeof(params) == 'undefined' ) {
			params = {};
		}
		
		host = params['host'];
		
		if( 'debug' in params ) {
			debug = params['debug'];
		}
		
		if( 'onopen' in params ) {
			onopen_callback = params['onopen'];
		}

		if( 'onmessage' in params ) {
			onmessage_callback = params['onmessage'];
		} 

		if( 'onclose' in params ) {
			onclose_callback = params['onclose'];
		}
		
		initSocketConnection();
	};
		
	function initSocketConnection() {
		if( host !== null ) {	
			if( socket == null || socket.connected == false ) {
				//log('Trying connect ...');
			
				socket = io.connect(host);
				socket.on('connect', onOpen);
				socket.on('message', onMessage);
				socket.on('close', onClose);

			} else if( window.navigator.onLine == true ) {			
				socket.socket.onOpen();
			}
		}
	}
	
	function log(msg) {
		if( debug == true ) {
			console.log(msg);
		}
	}
	
	function ping() {
		if( window.navigator.onLine == false || socket.socket.connected == false) {			
			onClose();
		}
	}
		
	function onOpen() {
		onopen_callback();
				
		if( ping_interval !== null ) {
			clearInterval(ping_interval);
		}
				
		ping_interval = setInterval(ping, 5000);
		log("NRCSocket Open: connected = " + this.socket.connected);
	};
	
	function onMessage(msg) {				
		if( socket.socket.connected == true && window.navigator.onLine == true && typeof msg != 'undefined' ) {
			onmessage_callback(msg);
			log("NRCSocket Received: " + msg.data);
		}	
	};
	
	function onClose() {
		onclose_callback();
		
		if( ping_interval !== null ) {
			clearInterval(ping_interval);
		}
				
		log("NRCSocket Disconnected");
	};

	NRCSocket.send = function(msg){
	  	if( host !== null && typeof(msg) == 'undefined' ) { 
			log("NRCSocket ERROR: trying to send empty message"); 
			return; 
		}
		if( host !== null && socket.socket.connected == true && window.navigator.onLine == true ) {				
			socket.send(msg); 
			log('NRCSocket Sent: '+msg); 
		}
	};
		
}( window.NRCSocket = window.NRCSocket || {}, io ));



//*****************************************************************************/
//	NRCWhiteboard
//*****************************************************************************/

(function( NRCWhiteboard, NRCSocket ) {
	
	var container;
	var canvas = document.createElement('canvas');
	var bg_canvas = document.createElement('canvas');
	var ghost_canvas = document.createElement('canvas');
	var buffer_canvas = document.createElement('canvas');
	var context;
	var gcontext;
	var bcontext;
	var bgcontext;
			
	var key;
	var slot; 					// a unique id for connection to board
	
	var drag = false;
	var selected = [];
	var del_selected = []; 
	var resize = null; 			// int of resize handle returned if resizing, null otherwise
	var copied = [];
	var clicked = null;
	
	var objects = [];
	var history = [];
	var rhistory = [];
	var history_max = 50;
	var min_index = 0;
	var max_index = 0;
	var mx=0, my=0, ox, oy, dx, dy;
	
	var doredraw = false;
	var interval = 10; 
	
	var fill_style = '#FFFFFF';
	var stroke_style = '#000000';
	var line_width = 2;
	
	var font_size = 12;
	var font_family = 'Helvetica';
	var font_style = '#000000';
	var font_bold = false;
	var font_italic = false;
	var font_underline = false;
	var font_align = 'center';
	
	var fill_alpha = 1;
	var stroke_alpha = 1;
	var font_alpha = 1;
	
	var select_colors = [
		'#000000',
		'#FF0000',
		'#FF7F00',
		'#FFFF00',
		'#00FF00',
		'#0000FF',
		'#7F00FF',
		'#FF00FF',
		'#00FFFF',
		'#7F7F7F'
	];	
	
	var select_fill_style = select_colors[0];
	var select_stroke_style = select_colors[0];
	var select_line_width = 2;
	
	var buf_textarea = document.createElement('textarea');
	var buf_span = document.createElement('span');
	var instruction_text = "Select and double click to add text";
	
	var grid = false;
	var stick_to_grid = false;
	var grid_width = 100;
	
	var onselection_callback = function(){};
	var ondeselection_callback = function(){};
	var oncanvasmove_callback = function(){};
	var onuserjoin_callback = function(){};
	var onuserdisconnect_callback = function(){};
	var onchat_callback = function(){};
	
	NRCWhiteboard.TOOL_SELECT = 0;
	NRCWhiteboard.TOOL_RECT = 1;
	NRCWhiteboard.TOOL_ELLIPSE = 2;
	NRCWhiteboard.TOOL_TRIANGLE = 3;
	NRCWhiteboard.TOOL_RTRIANGLE = 4
	NRCWhiteboard.TOOL_LINE = 5;
	NRCWhiteboard.TOOL_TEXT = 6;
	NRCWhiteboard.TOOL_BRUSH = 7;
	NRCWhiteboard.TOOL_IMAGE = 8;
	NRCWhiteboard.TOOL_HAND = 9;
	NRCWhiteboard.TOOL_UNDO = 10;
	NRCWhiteboard.TOOL_REDO = 11;
	NRCWhiteboard.TOOL_POLY = 12;
	
	var tool = NRCWhiteboard.TOOL_SELECT;
	
	/*
		parameters:
		
			REQUIRED:
				canvas: id of canvas container element
				socket: the web socket url
				width: width of canvas
				height: height of canvas
				key: the whiteboard key
			
			OPTIONAL:
				onselection: callback function when an object is selected
					params: object
				ondeselection: callback function when an object is deselected
					params: object
				oncanvasmove: callback function when the canvas is moved
					params: none
				onuserjoin: callback function when a user joins
					params: object
				onuserdisconnect: callback function when a user disconnects
					params: object
				onchat: callback function for chat messages
					params: object
	*/
	NRCWhiteboard.init = function(params) {
		if( typeof(params) == 'undefined' ) {
			params = {};
		}

		container = document.getElementById(params['canvas']);
		
		container.style.position = 'relative';
		
		canvas.setAttribute('width', params['width']);
		canvas.setAttribute('height', params['height']);
		canvas.style.position = 'absolute';
		canvas.style.left = '0px';
		canvas.style.top = '0px';
		canvas.style.zIndex = '1';
		
		bg_canvas.setAttribute('width', params['width']);
		bg_canvas.setAttribute('height', params['height']);
		bg_canvas.style.backgroundColor = '#FFFFFF';
		bg_canvas.style.position = 'absolute';
		bg_canvas.style.left = '0px';
		bg_canvas.style.top = '0px';
		bg_canvas.style.zIndex = '0';
		
		container.appendChild(bg_canvas);
		container.appendChild(canvas);
								
		context = canvas.getContext("2d");
		bgcontext = bg_canvas.getContext("2d");
				
		// double buffering
		bcontext = buffer_canvas.getContext("2d");
		bcontext.canvas.setAttribute('width', params['width']);
		bcontext.canvas.setAttribute('height', params['height']);
		
		// this is useful for selecting objects
		gcontext = ghost_canvas.getContext("2d");
		gcontext.canvas.setAttribute('width', params['width']);
		gcontext.canvas.setAttribute('height', params['height']);
		
		// buffers for text boxes
		buf_textarea.style.display = 'none';
		buf_textarea.style.position = 'absolute';
		buf_textarea.style.overflow = 'hidden';
		buf_textarea.style.resize = 'none';
		buf_textarea.style.zIndex = '2';
		document.body.appendChild(buf_textarea);

		buf_span.style.position = 'absolute';
		buf_span.style.left = '-1000px';
		buf_span.style.top = '0px';
		document.body.appendChild(buf_span);
		
		canvas.onmousedown = onMouseDown;
		canvas.onmouseup = onMouseUp;
		canvas.ondblclick = onDblClick;
		canvas.onselectstart = function(e){return false;};
		
		buf_textarea.addEventListener("keyup", textareaOnKeyUp, false);
		
		key = params['key'];
		
		NRCSocket.init({
			'host': params['socket'] || null,
			'onopen': onSocketOpen,
			'onmessage': onSocketMessage,
			'onclose': onSocketClose,
			'debug': false
		});
		
		if( 'onselection' in params ) {
			onselection_callback = params['onselection'];
		}
		if( 'ondeselection' in params ) {
			ondeselection_callback = params['ondeselection'];
		}
		if( 'oncanvasmove' in params ) {
			oncanvasmove_callback = params['oncanvasmove'];
		}
		if( 'onuserjoin' in params ) {
			onuserjoin_callback = params['onuserjoin'];
		}
		if( 'onuserdisconnect' in params) {
			onuserdisconnect_callback = params['onuserdisconnect'];
		}
		if( 'onchat' in params) {
			onchat_callback = params['onchat'];
		}
		
		setInterval(draw, interval);
	}
	
	/*************************************************************************/
	
	
	NRCWhiteboard.setTool = function(arg) {
		if( tool !== arg ) {
			tool = arg;

			if( tool !== NRCWhiteboard.TOOL_SELECT ) {
				if( selected.length > 0 ) {
					for( var i in selected ) {
						selected[i].deselect();
						syncObject('deselect', selected[i]);
					}
					selected.length = 0;
					redraw();
				}
			}
		}
	}
	
	NRCWhiteboard.setFillStyle = function(fill, alpha) {		
		fill_style = fill;
		fill_alpha = alpha;
		
		if( selected.length > 0 ) {
			var hqueue = [];
			for( var i in selected ) {
				if( selected[i].fill_style != fill_style || selected[i].fill_alpha != fill_alpha ) {
					hqueue.push(selected[i].copy());
					selected[i].fill_style = fill_style;
					selected[i].fill_alpha = fill_alpha;
					syncObject('propchange', selected[i]);
				}
			}
			
			if( hqueue.length > 0 ) {
				addHistory('propchange', hqueue);
				redraw();
			}
		}
	}
	
	NRCWhiteboard.setStrokeStyle = function(stroke, alpha) {		
		stroke_style = stroke;
		stroke_alpha = alpha;
		
		if( selected.length > 0 ) {
			var hqueue = [];
			for( var i in selected ) {
				if( selected[i].stroke_style != stroke_style || selected[i].stroke_alpha != stroke_alpha ) {
					hqueue.push(selected[i].copy());
					selected[i].stroke_style = stroke_style;
					selected[i].stroke_alpha = stroke_alpha;
					syncObject('propchange', selected[i]);
				}
			}
			
			if( hqueue.length > 0 ) {
				addHistory('propchange', hqueue);
				redraw();
			}
		}
	}
	
	NRCWhiteboard.setLineWidth = function(arg) {		
		line_width = arg;
		
		if( selected.length > 0 ) {
			var hqueue = [];
			for( var i in selected ) {
				if( selected[i].line_width != line_width ) {
					hqueue.push(selected[i].copy());
					selected[i].line_width = line_width;
					syncObject('propchange', selected[i]);
				}
			}
			
			if( hqueue.length > 0 ) {
				addHistory('propchange', hqueue);
				redraw();
			}
		}
	}
	
	NRCWhiteboard.setFontFamily = function(arg) {
		font_family = arg;
		
		if( selected.length > 0 ) {
			var hqueue = [];
			for( var i in selected ) {
				if( selected[i].class_name == 'TextObject' && selected[i].font_family.toLowerCase() != font_family.toLowerCase() ) {
					hqueue.push(selected[i].copy());
					selected[i].font_family = font_family;
					if( !selected[i].editing == true ) {
						syncObject('propchange', selected[i]);
					}					
				}
			}
			
			if( hqueue.length > 0 ) {
				addHistory('propchange', hqueue);
				redraw();
			}
		}
	}
	
	NRCWhiteboard.setFontSize = function(arg) {
		font_size = arg;
		
		if( selected.length > 0 ) {
			var hqueue = [];
			for( var i in selected ) {
				if( selected[i].class_name == 'TextObject' && selected[i].font_size != font_size ) {
					hqueue.push(selected[i].copy());
					selected[i].font_size = font_size;
					if( !selected[i].editing == true ) {
						syncObject('propchange', selected[i]);
					}
				}
			}
			
			if( hqueue.length > 0 ) {
				addHistory('propchange', hqueue);
				redraw();
			}
		}
	}
	
	NRCWhiteboard.setFontStyle = function(fill, alpha) {
		font_style = fill;
		font_alpha = alpha;
		
		if( selected.length > 0 ) {
			var hqueue = [];
			for( var i in selected ) {
				if( selected[i].class_name == 'TextObject' && (selected[i].font_style != font_style || selected[i].font_alpha != font_alpha) ) {
					hqueue.push(selected[i].copy());
					selected[i].font_style = font_style;
					selected[i].font_alpha = font_alpha;
					if( !selected[i].editing == true ) {
						syncObject('propchange', selected[i]);
					}
				}
			}
			
			if( hqueue.length > 0 ) {
				addHistory('propchange', hqueue);
				redraw();
			}
		}
	}
	
	NRCWhiteboard.setFontAlign = function(arg) {		
		font_align = arg;
		
		if( selected.length > 0 ) {
			var hqueue = [];
			for( var i in selected ) {
				if( selected[i].class_name == 'TextObject' && selected[i].font_align != font_align ) {
					hqueue.push(selected[i].copy());
					selected[i].font_align = font_align;
					if( !selected[i].editing == true ) {
						syncObject('propchange', selected[i]);
					}
				}
			}
			
			if( hqueue.length > 0 ) {
				addHistory('propchange', hqueue);
				redraw();
			}
		}
	}
	
	NRCWhiteboard.toggleBold = function() {
		font_bold = font_bold == true ? false : true;
		
		if( selected.length > 0 ) {
			var hqueue = [];
			for( var i in selected ) {
				if( selected[i].class_name == 'TextObject' && selected[i].font_bold != font_bold ) {
					hqueue.push(selected[i].copy());
					selected[i].font_bold = font_bold;
					if( !selected[i].editing == true ) {
						syncObject('propchange', selected[i]);
					}
				}
			}
			
			if( hqueue.length > 0 ) {
				addHistory('propchange', hqueue);
				redraw();
			}
		}
	}
	
	NRCWhiteboard.toggleItalic = function() {
		font_italic = font_italic == true ? false : true;
		
		if( selected.length > 0 ) {
			var hqueue = [];
			for( var i in selected ) {
				if( selected[i].class_name == 'TextObject' && selected[i].font_italic != font_italic ) {
					hqueue.push(selected[i].copy());
					selected[i].font_italic = font_italic;
					if( !selected[i].editing == true ) {
						syncObject('propchange', selected[i]);
					}
				}
			}
			
			if( hqueue.length > 0 ) {
				addHistory('propchange', hqueue);
				redraw();
			}
		}
	}
	
	NRCWhiteboard.toggleUnderline = function() {
		font_underline = font_underline == true ? false : true;
		
		if( selected.length > 0 ) {
			var hqueue = [];
			for( var i in selected ) {
				if( selected[i].class_name == 'TextObject' && selected[i].font_underline != font_underline ) {
					hqueue.push(selected[i].copy());
					selected[i].font_underline = font_underline;
					if( !selected[i].editing == true ) {
						syncObject('propchange', selected[i]);
					}
				}
			}
			
			if( hqueue.length > 0 ) {
				addHistory('propchange', hqueue);
				redraw();
			}
		}
	}
	
	NRCWhiteboard.remove = function() {
		if( selected.length > 0 ) {	
			var hqueue = [];
			
			for( var i in selected ) {
				if( selected[i].class_name == 'TextObject' && selected[i].editing == true ) {
					return;
				}
				
				for( var k = objects.length-1; k >= 0; k-- ) {
					if( objects[k].id == selected[i].id ) {						
						hqueue.push(selected[i].copy());
						del_selected.push(selected[i].copy());
						
						selected[i].deselect();
						
						syncObject('remove', selected[i]);
						objects.splice(k,1);
						break;
					}
				}
			}
			
			if( hqueue.length > 0 ) {
				addHistory('remove', hqueue);			
				selected.length = 0;
				redraw();
			}
		}
	}
	
	NRCWhiteboard.clear = function(sync) {		
		var length = objects.length;
		
		if( length > 0 ) {
			var offset = 0;
			var harray = [];
			for( var i = 0; i < length; i++ ) {
				var k = i - offset;
				if( objects[k].created == true ) {	
					harray.push(objects.splice(k,1)[0]);
					offset += 1;
				}
			}

			if( harray.length > 0 ) {				
				addHistory('remove', harray);
				
				if( typeof sync == 'undefined' ) {
					syncObject('clear', null);
				}
			}
			
			if( selected.length > 0 ) {
				del_selected = [];
				for( var i in selected ) {
					del_selected.push(selected[i].copy());
					selected[i].deselect();
				}
				selected.length = 0;
			}
			
			redraw();
		}
	}
	
	NRCWhiteboard.getCanvasOrigin = function() {
		var x = 0;
		var y = 0;
		
		if( canvas.style.marginLeft != '' ) {
			x = Math.abs(parseInt(canvas.style.marginLeft));
		}
		if( canvas.style.marginTop != '' ) {
			y = Math.abs(parseInt(canvas.style.marginTop));
		}
		
		return {x:x, y:y};
	}
	
	NRCWhiteboard.toggleGrid = function() {
		grid = grid == true ? false : true;
		redrawGrid();
	}
	
	NRCWhiteboard.toggleStickToGrid = function() {
		stick_to_grid = stick_to_grid == true? false : true;
	}
	
	NRCWhiteboard.setGridWidth = function(arg) {
		grid_width = arg;
		
		if( grid == true ) {
			redrawGrid();
		}
	}
	
	NRCWhiteboard.undo = function(obj) {
		var send = true;
		
		if( typeof obj == 'undefined' || obj === null ) {
			if( selected.length > 0 ) {
				for( var i in selected ) {
					if( selected[i].class_name == 'TextObject' && selected[i].editing == true ) {
						return;
					}
				}
			}
			
			if( history.length > 0 ) {
				obj = history.pop();
			}
			else {
				return;
			}
		}
		else {
			send = false;
		}
						
		for( var k in obj.obj ) {		
			switch( obj.action ) {
				case 'send-back':
					NRCWhiteboard.sendToFront(obj.obj[k]);					
					syncObject('U'+obj.action, obj.obj[k], send);
					break;

				case 'send-front':
				case 'send-front-adjust':
					NRCWhiteboard.sendToBack(obj.obj[k]);
					syncObject('U'+obj.action, obj.obj[k], send);
					break;

				case 'remove':
					objects.push(obj.obj[k]);
					syncObject('U'+obj.action, obj.obj[k], send);
					objects.sort(compare_index);
					
					if( del_selected.length > 0 ) {
						for( var i in del_selected ) {
							if( del_selected[i].id == obj.obj[k].id ) {
								obj.obj[k].select();
								selected.push(obj.obj[k]);
								syncObject('select', obj.obj[k]);
								
								del_selected.splice(i, 1);
								break;
							}
						}
					}
					redraw();					
					break;

				case 'create':
				case 'jcreate':
					for( var i = objects.length-1; i >= 0; i-- ) {												
						if( objects[i].id == obj.obj[k].id ) {
							objects.splice(i,1);
							syncObject('U'+obj.action, obj.obj[k], send);
							
							if( selected.length > 0 ) {
								for( var l in selected ) {
									if( selected[l].id == obj.obj[k].id ) {
										selected[l].deselect();
										del_selected.push(selected[l].copy());
										
										selected.splice(l, 1);
										break;
									}
								}
							}
							redraw();
							break;
						}
					}
					break;

				case 'propchange':
					for( var i = objects.length-1; i >= 0; i-- ) {						
						if( objects[i].id == obj.obj[k].id ) {
							syncObject('upropchange', obj.obj[k], send);
							
							// prevent reloading and flickering of images
							var image = null;
							if( objects[i].class_name == 'ImageObject' ) {
								image = objects[i].image;
							}
							
							var tmp = objects[i].copy();
							objects[i] = obj.obj[k].copy();
							obj.obj[k] = tmp;
							
							if( image !== null ) {
								objects[i].image = image;
							}
							
							if( selected.length > 0 ) {
								for( var l in selected ) {
									if( selected[l].id == objects[i].id ) {
										selected[l] = objects[i];
										objects[i].select();
										syncObject('select', objects[i]);
										break;
									}
								}
							}
							
							redraw();
							break;
						}
					}
					break;

				default:
					break;
			}
		}
		if( obj.action !== 'send-front-adjust' && obj.action !== 'jcreate') {
			addHistory(obj.action, obj.obj, rhistory);
		}
	}
	
	NRCWhiteboard.redo = function(obj) {
		var send = true;
		
		if( typeof obj == 'undefined' || obj === null ) {
			if( selected.length > 0 ) {
				for( var i in selected ) {
					if( selected[i].class_name == 'TextObject' && selected[i].editing == true ) {
						return;
					}
				}
			}
			
			if( rhistory.length > 0 ) {
				obj = rhistory.pop();
			}
			else {
				return;
			}
		}
		else {
			send = false;
		}
																
		for( var k in obj.obj ) {	
			switch( obj.action ) {			
				case 'send-back':
					NRCWhiteboard.sendToBack(obj.obj[k]);
					syncObject(obj.action, obj.obj[k], send);
					break;

				case 'send-front':
				case 'send-front-adjust':
					NRCWhiteboard.sendToFront(obj.obj[k]);
					syncObject(obj.action, obj.obj[k], send);
					break;

				case 'remove':
					for( var i = objects.length-1; i >= 0; i-- ) {						
						if( objects[i].id == obj.obj[k].id ) {
							objects.splice(i,1);
							syncObject(obj.action, obj.obj[k], send);
							
							if( selected.length > 0 ) {
								for( var l in selected ) {
									if( selected[l].id == obj.obj[k].id ) {
										selected[l].deselect();
										del_selected.push(selected[l].copy());
										
										selected.splice(l, 1);
										break;
									}
								}
							}
							
							redraw();
							break;
						}
					}
					break;

				case 'create':
				case 'jcreate':
					objects.push(obj.obj[k]);
					syncObject(obj.action, obj.obj[k], send);
					objects.sort(compare_index);
					
					if( del_selected.length > 0 ) {
						for( var i in del_selected ) {
							if( del_selected[i].id == obj.obj[k].id ) {
								obj.obj[k].select();
								selected.push(obj.obj[k]);
								syncObject('select', obj.obj[k]);
								
								del_selected.splice(i, 1);
								break;
							}
						}
					}
					else if( obj.obj[k].selected == true && obj.obj[k].selected_owner == slot ) {
						selected.push(obj.obj[k]);
					}
					
					redraw();					
					break;

				case 'propchange':
					for( var i = objects.length-1; i >= 0; i-- ) {						
						if( objects[i].id == obj.obj[k].id ) {
							syncObject('propchange', obj.obj[k], send);
							
							// prevent reloading and flickering of images
							var image = null;
							if( objects[i].class_name == 'ImageObject' ) {
								image = objects[i].image;
							}
							
							var tmp = objects[i].copy();						
							objects[i] = obj.obj[k].copy();
							obj.obj[k] = tmp;
							
							if( image !== null ) {
								objects[i].image = image;
							}
							
							if( selected.length > 0 ) {
								for( var l in selected ) {
									if( selected[l].id == objects[i].id ) {
										selected[l] = objects[i];
										objects[i].select();
										syncObject('select', objects[i]);
										break;
									}
								}
							}
														
							redraw();
							break;
						}
					}
					break;

				default:
					break;
			}
		}
		if( obj.action !== 'send-front-adjust' && obj.action !== 'jcreate' ) {
			addHistory(obj.action, obj.obj);	
		}
	}
	
	NRCWhiteboard.sendToBack = function(obj) {
		var send = false;
		if( typeof obj == 'undefined' ) {
			send = true
			obj = selected;
		}
		
		if( obj.constructor.toString().indexOf("Array") == -1 ) {
			obj = [obj];
		}
		
		obj.sort(compare_index);
		
		var hqueue = [];
		for( var k = obj.length-1; k >= 0; k-- ) {
			for( var i = objects.length-1; i >= 0; i--) {
				if( objects[i].id == obj[k].id ) {					
					var o = objects.splice(i,1)[0];	
					o.index = --min_index;
					objects.unshift(o);	
					
					if( send ) {
						hqueue.push(o.copy());
						syncObject('send-back', o);
					}
									
					redraw();
					break;
				}
			}
		}
		
		if( hqueue.length > 0 ) {
			addHistory('send-back', hqueue);
		}
	}
	
	NRCWhiteboard.sendToFront = function(obj) {
		var send = false;
		if( typeof obj == 'undefined' ) {
			send = true;
			obj = selected;
		}
		
		if( obj.constructor.toString().indexOf("Array") == -1 ) {
			obj = [obj];
		}
		
		obj.sort(compare_index);
		
		var hqueue = [];
		for( var k in obj ) {
			for( var i in objects ) {
				if( objects[i].id == obj[k].id ) {					
					var o = objects.splice(i,1)[0];
					o.index = ++max_index;
					objects.push(o);
					
					if( send ) {
						hqueue.push(o.copy());
						syncObject('send-front', o);
					}
					
					redraw();
					break;
				}
			}
		}
		
		if( hqueue.length > 0 ) {
			addHistory('send-front', hqueue);
		}
	}
	
	NRCWhiteboard.convertToPNG = function() {
		return canvas.toDataURL('image/png');
	}
	
	NRCWhiteboard.copy = function() {
		copied.length = 0;
		if( selected.length > 0 ) {
			for( var i in selected ) {
				if( selected[i].class_name == 'TextObject' && selected[i].editing == true ) {
					copied.length = 0;
					return;
				}
				
				copied.push(selected[i].copy());
			}
		}
	}
	
	NRCWhiteboard.paste = function() {
		if( selected.length > 0 ) {
			for( var i in selected ) {
				if( selected[i].class_name == 'TextObject' && selected[i].editing == true ) {
					return;
				}
			}
		}
		
		if( copied.length > 0 ) {
			if( selected.length > 0 ) {
				for( var k in selected ) {
					selected[k].deselect();
					syncObject('deselect', selected[k]);
				}
				selected.length = 0;
			}
			
			var hqueue = [];
			for( var i in copied ) {
				copied[i].id = uuid();	
				copied[i].index += 1;		
				copied[i].x += 10;
				copied[i].y += 10;

				if( copied[i].class_name == 'BrushObject' || copied[i].class_name == 'PolyObject' ) {
					for(var k in copied[i].points) {
						copied[i].points[k].x += 10;
						copied[i].points[k].y += 10;
					}
				}
			
				copied[i].select();
				copied[i].index = max_index++;
				var obj = copied[i].copy();
				objects.push(obj);
				selected.push(obj);
				syncObject('create', obj);
				hqueue.push(obj);
			}
						
			addHistory('create', hqueue);
			redraw();
		}
	}
	
	NRCWhiteboard.addImage = function(url, offset_x, offset_y) {
		if( typeof url == 'undefined' ) {
			return;
		}
		
		var obj = new ImageObject;
		obj.index = max_index++;
		obj.url = url;
		
		if( typeof offset_x !== 'undefined' ) {
			obj.x += offset_x;
		}
		
		if( typeof offset_y !== 'undefined' ) {
			obj.y += offset_y;
		}
		
		objects.push(obj);
		redraw();
	}
	
	NRCWhiteboard.chat = function(msg) {
		if( typeof msg == 'undefined' || msg == '' ) {
			return;
		}
		
		NRCSocket.send(JSON.stringify({type:'CHAT', msg:msg}));
	}
	
	NRCWhiteboard.setMousePosition = function (x, y) {				
		mx = x - container.offsetLeft - canvas.offsetLeft;
		my = y - container.offsetTop - canvas.offsetTop;
	}
	
	NRCWhiteboard.resetCanvasPosition = function() {
		setCanvasPosition(0, 0, true);
	}
	
	NRCWhiteboard.identify = function(name) {
		if( typeof name == 'undefined' || name == '' ) {
			return;
		}
		
		NRCSocket.send(JSON.stringify({type:'IDENTIFY', msg:name}));
	}
	
	NRCWhiteboard.selectAll = function() {		
		for( var i in objects ) {
			if( objects[i].selected == false ) {
				objects[i].select();
				syncObject('select', objects[i]);
				selected.push(objects[i]);
			}
		}
		redraw();
	}
		
	/*************************************************************************/
	
	function onSocketOpen() {			
		NRCSocket.send(JSON.stringify({type:'JOIN', msg:key}));
	}
	
	function onSocketClose() {
		onUserDisconnect({slot:slot, owner:true});
	}
	
	function onSocketMessage(msg) {	
		var data = JSON.parse(msg);
							
		switch( data['type'] ) {
			case 'CHAT':
				onChat({
					name: data['name'],
					color: select_colors[parseInt(data['slot']) % select_colors.length],
					slot: data['slot'],
					msg: data['msg']
				});
				
				break;
			
			case 'JOIN':
			case 'IDENTIFY':			
				var n = data['name'];
				var s = parseInt(data['slot']);
				var c = select_colors[s % select_colors.length];
				onUserJoin({name:n, color:c, slot:s, owner: s == slot});
				break;
				
			case 'JOINED':
				slot = data['slot'];
				var index = slot % select_colors.length
				select_fill_style = select_colors[index];
				select_stroke_style = select_colors[index];
				
				objects.length = history.length = rhistory.length = 0;
				onUserJoin({name:'Me', color:select_fill_style, slot:slot, owner:true});
				break;
				
			case 'DISCONNECT':							
				onUserDisconnect({slot:data['slot']});
				
				if( selected.length > 0 ) {
					for( var i in selected ) {
						selected[i].deselect();
					}
					selected.length = 0;
					redraw();
				}
			
				break;
				
			case 'CLEAR':
				NRCWhiteboard.clear(false);
				break;
				
			case 'SELECT':	
			case 'DESELECT':
				var obj = parse(JSON.parse(data['obj']));
				
				for( var i = objects.length-1; i >= 0; i-- ) {						
					if( objects[i].id == obj.id ) {
						if( data['type'] == 'SELECT' && selected.length > 0 ) {
							for( var k in selected ) {
								if( selected[k].id == obj.id ) {
									// Conflict, give way to lesser slot
									if( slot > data['slot'] ) {
										drag = false;
										selected[k].deselect();
										selected.splice(k,1);
										redraw();
										return;
									}
									else {
										selected[k] = objects[i];
										objects[i].select();

										// re-sync that event, in case owner 2 received after owner 1, for example on owner 3 screen.
										syncObject('select', selected[k]);
										return;
									}
								}
							}
						}
						
						var image = null;
						if( objects[i].class_name == 'ImageObject' ) {
							image = objects[i].image;
						}
						
						objects[i] = obj;
						
						if( image !== null ) {
							objects[i].image = image;
						}
						redraw();
					}
				}
				break;
		
			case 'JCREATE':
			default:			
				var obj = parse(JSON.parse(data['obj']));
				
				if( data['type'] == 'UREMOVE' || data['type'] == 'CREATE' || data['type'] == 'JCREATE' ) {					
					max_index = Math.max(max_index, obj.index);
					min_index = Math.min(min_index, obj.index);
					
					if( slot < data['slot'] && objects.length > 0 && obj.index <= max_index ) {						
						obj.index = max_index++;
						syncObject('send-front-adjust', obj);
					}
				}
											
				if( data['type'][0] == 'U' ) {
					NRCWhiteboard.undo({action:data['type'].toLowerCase().substr(1,data['type'].length-1), obj:[obj]});
				}	
				else {
					NRCWhiteboard.redo({action:data['type'].toLowerCase(), obj:[obj]});
				}
				
				break;
		}
	}
	
	function compare_index(a, b) {
		return a.index - b.index;
	}
	
	function parse(o) {
		switch( o.class_name ) {
			case 'RectObject':
				var obj = new RectObject(false);
				break;
			case 'EllipseObject':
				var obj = new EllipseObject(false);
				break;
			case 'TriangleObject':
				var obj = new TriangleObject(false);
				break;
			case 'RTriangleObject':
				var obj = new RTriangleObject(false);	
				break;
			case 'LineObject':
				var obj = new LineObject(false);
				break
			case 'TextObject':
				var obj = new TextObject(false);
			 	break; 
			case 'BrushObject':
				var obj = new BrushObject(false);
			 	break;
			case 'ImageObject':
				var obj = new ImageObject(false);
				break;
			case 'PolyObject':
				var obj = new PolyObject(false);
				break;
			default:
				return;
	 	}
		
		for( prop in o ) {
			if( !(/^__/.test(prop)) ) {
				obj[prop] = o[prop];
			}
		}
						
		obj.generateHandles();
						
		return obj;
	}
	
	function stringify(obj) {
		var o = obj.copy();
		delete o.handles;
		delete o.save;
		
		if( o.class_name == 'ImageObject' ) {
			delete o.image;
		}
		else if( o.class_name == 'TextObject' ) {
			o.editing = false;
		}
			
		return JSON.stringify(o);
	}

	function syncObject(type, obj, send) {
		if( typeof send == 'undefined' ) {
			send = true;
		}
		
		if( send ) {
			var o = '';
			if( obj !== null ) {
				var o = stringify(obj);
			}
			
			NRCSocket.send(JSON.stringify({type:type.toUpperCase(), obj:o}));
		}
	}

	function addHistory(type, obj, arr) {
		if( typeof arr == 'undefined' || arr === null ) {
			arr = history;		
		}
		
		if( obj.constructor.toString().indexOf("Array") == -1 ) {
			obj = [obj];
		}		
						
		for( var i in obj ) {						
			obj[i] = obj[i].copy();
			obj[i].selected = false;
		}
		
		
		// FIXME FIXME IS this correct???
		
		if( arr.length > 0 ) {			
			if( type == 'remove' && arr[arr.length-1].action == 'remove') {								
				var do_pop = true;
				for( var i in obj ) {
					var found = false;
					for( var k in arr[arr.length-1].obj ) {
						if( arr[arr.length-1].obj[k].id == obj[i].id ) {
							found = true;
							break;
						}
					}
					
					if( found == false ) {
						do_pop = false;
						break;
					}
				}
				if( do_pop == true ) {
					arr.pop();
				}
			}
		}
				
		arr.push({action: type, obj:obj});
		
		if( arr.length > history_max ) {
			arr.shift();
		}
	}

	function uuid() { // rfc4122 version 4
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
		    return v.toString(16);
		});
	}
	
	function clear(c) {
		c.clearRect(0, 0, c.canvas.width, c.canvas.height);
	}

	function redraw() {
		doredraw = true;
	}
	
	function redrawGrid() {
		bgcontext.clearRect(0, 0, bgcontext.canvas.width, bgcontext.canvas.height);
		
		if( grid == true ) {	
			for( var i = grid_width; i < bgcontext.canvas.width; i += grid_width ) {
				if( i % 100 == 0 ) {continue};
				bgcontext.beginPath();
				bgcontext.moveTo(i, 0);
				bgcontext.lineTo(i, bgcontext.canvas.height);
				bgcontext.closePath();

				bgcontext.strokeStyle = '#EFEFEF';
				bgcontext.lineWidth = 2;
				bgcontext.stroke();
			}
			for( var i = grid_width; i < bgcontext.canvas.height; i += grid_width ) {
				if( i % 100 == 0 ) {continue};
				bgcontext.beginPath();
				bgcontext.moveTo(0, i);
				bgcontext.lineTo(bgcontext.canvas.width, i);
				bgcontext.closePath();

				bgcontext.strokeStyle = '#EFEFEF';
				bgcontext.lineWidth = 2;
				bgcontext.stroke();
			}
			for( var i = grid_width; i < bgcontext.canvas.width; i += grid_width ) {
				if( i % 100 != 0 ) {continue};
				bgcontext.beginPath();
				bgcontext.moveTo(i, 0);
				bgcontext.lineTo(i, bgcontext.canvas.height);
				bgcontext.closePath();

				bgcontext.strokeStyle = '#DDDDDD';
				bgcontext.lineWidth = 2;
				bgcontext.stroke();
			}
			for( var i = grid_width; i < bgcontext.canvas.height; i += grid_width ) {
				if( i % 100 != 0 ) {continue};
				bgcontext.beginPath();
				bgcontext.moveTo(0, i);
				bgcontext.lineTo(bgcontext.canvas.width, i);
				bgcontext.closePath();

				bgcontext.strokeStyle = '#DDDDDD';
				bgcontext.lineWidth = 2;
				bgcontext.stroke();
			}
		}
	}

	function draw() {
		if( doredraw == true ) {
			clear(context);
			clear(bcontext);
			
			for( var i in objects ) {
				objects[i].draw(bcontext);
				
				if( objects[i].selected == true && objects[i].created == true ) {
					objects[i].drawSelect(bcontext);
				}
			}
			
			if( dx !== null & dy !== null ) {
				bcontext.strokeStyle = select_stroke_style;		
				bcontext.lineWidth = select_line_width;
				bcontext.strokeRect(dx, dy, mx-dx, my-dy);
			}
			
			context.drawImage(buffer_canvas, 0, 0);
			
			doredraw = false;
		}
	}
	
	function setMousePosition(e) {				
		mx = e.pageX - container.offsetLeft - canvas.offsetLeft;
		my = e.pageY - container.offsetTop - canvas.offsetTop;
	}
	
	function setCanvasPosition(x, y, resize) {
		if( typeof resize == 'undefined' ) {
			resize = false;
		}
				
		var saved_margin_left = canvas.style.marginLeft;
		var saved_margin_top = canvas.style.marginTop;
				
		var container_width = parseInt(container.style.width);
		var container_height = parseInt(container.style.height);

		if( resize ) {
			var marginTop = canvas.style.marginTop != '' ? parseInt(canvas.style.marginTop) : 0;
			var marginLeft = canvas.style.marginLeft != '' ? parseInt(canvas.style.marginLeft) : 0;
			
			if( container_width > canvas.width + marginLeft ) {
				bg_canvas.style.marginLeft = canvas.style.marginLeft = Math.max(container_width >= canvas.width ? 0 : container_width - canvas.width, Math.min(0, (x - ox))) + 'px';					
			}
						
			if( container_height > canvas.height + marginTop ) {
				bg_canvas.style.marginTop = canvas.style.marginTop = Math.max(container_height >= canvas.height ? 0 : container_height - canvas.height, Math.min(0, (y - oy))) + 'px';
			}
		}
		else {
			bg_canvas.style.marginLeft = canvas.style.marginLeft = Math.max(container_width >= canvas.width ? 0 : container_width - canvas.width, Math.min(0, (x - ox))) + 'px';					
			bg_canvas.style.marginTop = canvas.style.marginTop = Math.max(container_height >= canvas.height ? 0 : container_height - canvas.height, Math.min(0, (y - oy))) + 'px';
		}
		
		if( saved_margin_left != canvas.style.marginLeft || saved_margin_top != canvas.style.marginTop ) {
			onCanvasMove();
		}
	}
	
	function createAndSelectObject(obj_id) {
		switch( obj_id ) {
			case NRCWhiteboard.TOOL_RECT:
				var obj = new RectObject;
				break;
			case NRCWhiteboard.TOOL_ELLIPSE:
				var obj = new EllipseObject;
				break;
			case NRCWhiteboard.TOOL_TRIANGLE:
				var obj = new TriangleObject;
				break;
			case NRCWhiteboard.TOOL_RTRIANGLE:
				var obj = new RTriangleObject;	
				break;
			case NRCWhiteboard.TOOL_LINE:
				var obj = new LineObject;
				break
			case NRCWhiteboard.TOOL_TEXT:
				var obj = new TextObject;
			 	break; 
			case NRCWhiteboard.TOOL_BRUSH:
				var obj = new BrushObject;
			 	break;
			case NRCWhiteboard.TOOL_IMAGE:
				var obj = new ImageObject;
				break;
			case NRCWhiteboard.TOOL_POLY:
				var obj = new PolyObject;
				break;
			default:
				return;
	 	}	
	
		obj.index = max_index;		
		obj.select();
		selected.push(obj);
		objects.push(obj);
	}

	function onMouseMove(e) {
		setMousePosition(e);
				
		if( drag == true ) {			
			switch( tool ) {
				case NRCWhiteboard.TOOL_SELECT:
					for( var i in selected ) {
						if( resize !== null ) { // resizing
							selected[i].resize();
						}
						else { // dragging															
							selected[i].position()
						}
					}
					
					if( resize === null && grid == true && clicked !== null && stick_to_grid == true ) {	
						var buffer = Math.min(grid_width / 4, 10);

						var minx = Math.min(clicked.x, clicked.x + clicked.w);
						var miny = Math.min(clicked.y, clicked.y + clicked.h);

						var diff = (minx % grid_width) - clicked.line_width/2;
						var xdiff = 0;
						var ydiff = 0;
						
						if( diff <= buffer ) {		
							xdiff = -1 * diff;		
						}	
						else if( grid_width - diff <= buffer ) {				
							xdiff = grid_width - diff;
						}
						else {
							diff = ((minx + Math.abs(clicked.w)) % grid_width) + clicked.line_width/2;
							if( diff <= buffer ) {	
								xdiff = -1 * diff;
							}	
							else if( grid_width - diff <= buffer ) {					
								xdiff = grid_width - diff;
							}
						}
						
						diff = (miny % grid_width) - clicked.line_width/2;
						if( diff <= buffer ) {
							ydiff = -1 * diff;
						}
						else if( grid_width - diff <= buffer ) {
							ydiff = grid_width - diff;
						}
						else {
							diff = ((miny + Math.abs(clicked.h)) % grid_width) + clicked.line_width/2;
							if( diff <= buffer ) {
								ydiff = -1 * diff;
							}
							else if( grid_width - diff <= buffer ) {
								ydiff = grid_width - diff;
							}
						}
						
						for( var i in selected ) {
							selected[i].x += xdiff;
							selected[i].y += ydiff;
							
							if( selected[i].class_name == 'BrushObject' || selected[i].class_name == 'PolyObject' ) {
								for( var k in selected[i].points ) {
									selected[i].points[k].x += xdiff;
									selected[i].points[k].y += ydiff;
								}
							}
						}
					}
					redraw(); // always need to redraw here
					break;
					
				case NRCWhiteboard.TOOL_HAND:
					setCanvasPosition(e.pageX, e.pageY);
					break;
				
				case NRCWhiteboard.TOOL_RECT:
				case NRCWhiteboard.TOOL_ELLIPSE:
				case NRCWhiteboard.TOOL_TRIANGLE:
				case NRCWhiteboard.TOOL_RTRIANGLE:
				case NRCWhiteboard.TOOL_LINE:
				case NRCWhiteboard.TOOL_TEXT:
					resize = 4;
					if( selected.length > 0 ) {
						for( var i in selected ) {
							selected[i].resize();
						}
						redraw();
					}
					break;

				case NRCWhiteboard.TOOL_BRUSH:
				case NRCWhiteboard.TOOL_POLY:
					if( selected.length > 0 ) {
						for( var i in selected ) {
							selected[i].addPoint(mx, my);
						}
						redraw();
					}
					break;
					
				default:
					break;
			}
		}

		for( var i in selected ) {
			if( selected[i].created == true ) {
				if( selected[i].check_resize_handles() !== null ) {
					this.style.cursor = 'crosshair';
					break;
				}
				else if( selected[i].check_resize() ) {
					this.style.cursor = 'move';
					break;
				}
				else {
					this.style.cursor = 'auto';
				}
			}
		}
	}

	function onMouseDown(e) {				
		setMousePosition(e);
				
		if( drag == false ) {
			canvas.onmousemove = onMouseMove;
			drag = true;
		}
		else {			
			// User likely moved mouse off screen and released, still dragging
			return canvas.onmouseup(e);
		}
				
		switch( tool ) {
			case NRCWhiteboard.TOOL_SELECT:						
				var found = -1;
				clear(gcontext);
				
				for( var i = objects.length - 1; i >= 0; i-- ) {					
					if( objects[i].class_name == 'ImageObject' ) {
						if( objects[i].check_resize() ) {
							found = i;
							break;
						}
					}
					else {
						objects[i].draw(gcontext, false);
					}
 				
					if( objects[i].selected == true ) {
						if( objects[i].check_resize() ) {
							found = i;
							break;
						}
						objects[i].drawSelect(gcontext);
					}

					var image_data = gcontext.getImageData(mx, my, 1, 1);
					if( image_data.data[3] > 0 ) {	
						found = i;
						break;
					}
				}
				
				if( found > -1 ) {	
					clicked = objects[found];
									
					if( objects[found].selected == true && objects[found].selected_owner != slot ) {
						drag = false;
					}
					else {
						resize = objects[found].check_resize_handles();

						if( objects[found].selected == false || resize !== null ) {
							for( var i in selected ) {							
								if( selected[i].id !== objects[found].id ) {
									selected[i].deselect();
									syncObject('deselect', selected[i]);
								}
							}
							
							objects[found].select();
							syncObject('select', objects[found]);
							selected = [objects[found]];
						}
						
						for( var i in selected ) {
							selected[i].prep_offset();
							selected[i].save_state();
						}
						
						redraw();
					}
				}
				else {	
					clicked = null;
						
					for( var i in selected ) {
						selected[i].deselect();
						syncObject('deselect', selected[i]);
						redraw();
					}			
					selected.length = 0;
				}
				
				dx = dy = null;
				if( found == -1 ) { // selecting rect
					dx = mx;
					dy = my;
				}
				
				break;
				
			case NRCWhiteboard.TOOL_HAND:
				ox = e.pageX - canvas.offsetLeft; 
				oy = e.pageY - canvas.offsetTop;
				break;
			
			case NRCWhiteboard.TOOL_RECT:
			case NRCWhiteboard.TOOL_ELLIPSE:
			case NRCWhiteboard.TOOL_TRIANGLE:
			case NRCWhiteboard.TOOL_RTRIANGLE:
			case NRCWhiteboard.TOOL_LINE:
			case NRCWhiteboard.TOOL_TEXT:
			case NRCWhiteboard.TOOL_BRUSH:
			case NRCWhiteboard.TOOL_POLY:
				createAndSelectObject(tool);
				redraw();
				break;
				
			default:
				break;
		}
	}

	function onMouseUp(e) {
		if( drag == true ) {
			drag = false;
			
			this.style.cursor = 'auto';
			
			switch( tool ) {
				case NRCWhiteboard.TOOL_SELECT:
																
					// only want to save the history of the total move or re-position
					if( dx == null && dy == null ) {
						var hqueue = [];
						for( var i in selected ) {
							if( selected[i].save !== null ) {
								if( selected[i].save.x != selected[i].x || selected[i].save.y != selected[i].y || selected[i].save.w != selected[i].w || selected[i].save.h != selected[i].h ) {
									hqueue.push(selected[i].save.copy());
									syncObject('propchange', selected[i]);									
								}
									
								selected[i].save = null;
							}
						}
						
						if( hqueue.length > 0 ) {
							addHistory('propchange', hqueue);
						}
					}
					else if( mx != dx && my != dy ){						
						var x = dx;
						var y = dy;
						var w = mx - dx;
						var h = my - dy;
						
						if( w < 0 ) { 
							x += w;
							w = Math.abs(w);
						}
						
						if( h < 0 ) {
							y += h;
							h = Math.abs(h); 
						}
						
						for( var i in objects ) {
							if( !objects[i].selected ) {	
								var _x = objects[i].x;
								var _y = objects[i].y;
								var _w = objects[i].w;
								var _h = objects[i].h;

								if( _w < 0 ) { 
									_x += _w;
									_w = Math.abs(_w);
								}

								if( _h < 0 ) {
									_y += _h;
									_h = Math.abs(_h); 
								}
								
								var rabx = Math.abs(x + (x+w) - _x - (_x+_w));
								var raby = Math.abs(y + (y+h) - _y - (_y+_h));
																								
								if( rabx <= ((x+w)-x+(_x+_w)-_x) && raby <= ((y+h)-y+(_y+_h)-_y) ) {
									objects[i].select();
									selected.push(objects[i]);
									syncObject('select', objects[i]);
								}
							}
						}						
					}
					dx = dy = null;
					redraw();
					
					break;
				
				case NRCWhiteboard.TOOL_RECT:
				case NRCWhiteboard.TOOL_ELLIPSE:
				case NRCWhiteboard.TOOL_TRIANGLE:
				case NRCWhiteboard.TOOL_RTRIANGLE:
				case NRCWhiteboard.TOOL_LINE:
				case NRCWhiteboard.TOOL_TEXT:
				case NRCWhiteboard.TOOL_BRUSH:
				case NRCWhiteboard.TOOL_POLY:
					for( var i in selected ) {
						selected[i].deselect();
							
						if( selected[i].created == false ) {
							if( selected[i].class_name == "PolyObject" ) {
								selected[i].addPoint(selected[i].points[0].x, selected[i].points[0].y);
							}

							selected[i].created = true;
							NRCWhiteboard.sendToFront(selected[i]);							
							addHistory('create', selected[i]);
							syncObject('create', selected[i]);
						}
						
						redraw();
					}
					selected.length = 0;
					
					break;
					
				default:
					break;
			}
		}
		
		if( selected.length == 0 ) {
			canvas.onmousemove = null;
		}
	}
	
	function onDblClick(e) {
		if( clicked !== null && clicked.class_name == 'TextObject') {
			if( selected.length > 1 ) {
				for( var i in selected ) {
					if( selected[i].id != clicked.id ) {
						selected[i].deselect();
						syncObject('deselect', selected[i]);
					}
				}
				selected = [clicked];
			}
			
			clicked.showEdit();
			redraw();
		}
	}
	
	function textareaOnKeyUp(e) {
		if( clicked !== null ) {
			buf_span.innerHTML = 'X' + buf_textarea.value.replace(/\n/g, '<br\/>');
				
			var text_height = buf_span.offsetHeight;
			var offset = ((Math.abs(clicked.h) - text_height)/2);
			if( offset > 0 ) {
				buf_textarea.style.paddingTop = offset - (clicked.line_width/2) + 'px';
				
				var diff = 2;
				if( clicked.h & 1 ) {
					diff = 1;
				}
				
				buf_textarea.style.height = Math.abs(clicked.h) - offset - clicked.line_width/2 - diff + 'px';
			}
			else {
				buf_textarea.style.paddingTop = '0px';
								
				buf_textarea.style.height = Math.abs(clicked.h) - (clicked.line_width+2) + 'px';
			}
		}
	}
	
	// When an object is selected
	function onSelection(obj) {	
		fill_style = obj.fill_style;
		stroke_style = obj.stroke_style;
		line_width = obj.line_width;
		
		fill_alpha = obj.fill_alpha;
		stroke_alpha = obj.stroke_alpha;
		
		if( obj.class_name == 'TextObject' ) {
			font_size = obj.font_size;
			font_family = obj.font_family;
			font_style = obj.font_style;
			font_bold = obj.font_bold;
			font_italic = obj.font_italic;
			font_underline = obj.font_underline;
			font_align = obj.font_align;
			font_alpha = obj.font_alpha;
		}
		
		onselection_callback(obj);
	}
	
	// When an object is de-selected
	function onDeselection(object) {
		ondeselection_callback(object);
	}
	
	function onCanvasMove() {
		oncanvasmove_callback();
	}
	
	function onUserJoin(object) {
		onuserjoin_callback(object);
	}
	
	function onUserDisconnect(object) {
		onuserdisconnect_callback(object);
	}
	
	function onChat(object) {
		onchat_callback(object);
	}
	
	/*************************************************************************/
	
	
	function ShapeObject(do_handles) {
		if( typeof(do_handles) == 'undefined' ) {
			do_handles = true;
		}
		
		this.id = uuid();
		
		this.class_name = 'ShapeObject';
		this.index = 0;
		
		this.created = false;
		this.selected = false;
		this.selected_owner = null;
		
		this.w = 6;
		this.h = 6;
		this.x = mx - this.w;
		this.y = my - this.h;
		
		this.fill_style = fill_style;
		this.stroke_style = stroke_style;
		this.line_width = line_width;
		
		this.select_fill_style = select_fill_style;
		this.select_stroke_style = select_stroke_style;
		
		this.fill_alpha = fill_alpha;
		this.stroke_alpha = stroke_alpha;
		
		this.handles = [];
		this.save = null;
		
		if( do_handles ) {
			this.generateHandles();
		}
	}
	
	ShapeObject.prototype.generateHandles = function() {
		this.handles = [];
		for( var i = 0; i < 8; i++ ) {
			var handle = new RectObject(false);
			handle.fill_alpha = 1;
			handle.stroke_alpha = 1;
			handle.line_width = 2;
			handle.fill_style = this.select_fill_style;
			handle.stroke_style = this.select_stroke_style;
			this.handles.push( handle );
		}
	}
	
	ShapeObject.prototype.copy = function() {
		var obj = new this.constructor(false);
		
		obj.id = this.id;
		obj.class_name = this.class_name;
		obj.index = this.index;
		obj.created = this.created;
		obj.selected = this.selected;
		obj.selected_owner = this.selected_owner;
		obj.w = this.w;
		obj.h = this.h;
		obj.x = this.x;
		obj.y = this.y;
		
		obj.fill_style = this.fill_style;
		obj.stroke_style = this.stroke_style;
		obj.line_width = this.line_width;
		
		obj.select_fill_style = this.select_fill_style;
		obj.select_stroke_style = this.select_stroke_style;
		
		obj.fill_alpha = this.fill_alpha;
		obj.stroke_alpha = this.stroke_alpha;
		
		obj.generateHandles();
		
		return obj;
	}
		
	ShapeObject.prototype.prep_offset = function() {
		this.ox = mx - this.x;
		this.oy = my - this.y;
	}
	
	ShapeObject.prototype.save_state = function() {
		this.save = this.copy();
	}
		
	ShapeObject.prototype.position = function() {
		this.x = mx - this.ox;
		this.y = my - this.oy;
	}
	
	ShapeObject.prototype.check_resize_handles = function() {		
		for( var i = 0; i < this.handles.length; i++ ) {
			if( mx >= this.handles[i].x && mx <= this.handles[i].x + this.handles[i].w &&
				my >= this.handles[i].y && my <= this.handles[i].y + this.handles[i].h ) {
				return i;
			}
		}
		return null;
	}
	
	ShapeObject.prototype.check_resize = function() {
		var minx = Math.min(this.x, this.x + this.w);
		var miny = Math.min(this.y, this.y + this.h);
		
		if( mx >= minx && mx <= minx + Math.abs(this.w) && my >= miny && my <= miny + Math.abs(this.h) ) {
			return true;
		}
		return false;
	}
	
	ShapeObject.prototype.deselect = function() {
		this.selected = false;
		this.selected_owner = null;
		onDeselection(this);
	}
	
	ShapeObject.prototype.select = function() {
		this.selected = true;
		this.selected_owner = slot;
		
		this.select_fill_style = select_fill_style;
		this.select_stroke_style = select_stroke_style;
		for( var i in this.handles ) {
			this.handles[i].fill_style = select_fill_style;
			this.handles[i].stroke_style = select_stroke_style;
		}	
		onSelection(this);	
	}
	
	ShapeObject.prototype.drawSelect = function(context) {
		context.globalAlpha = 1;
		context.strokeStyle = this.select_stroke_style;		
		context.lineWidth = select_line_width;
		
		// account for line width
		var diff = select_line_width - this.line_width;
		
		var x = this.x + (this.w > 0 ? diff/2 : diff/2 * -1);
		var y = this.y + (this.h > 0 ? diff/2 : diff/2 * -1);
		var w = this.w + (this.w > 0 ? diff * -1 : diff);
		var h = this.h + (this.h > 0 ? diff * -1 : diff);
		
		context.strokeRect(x, y, w, h);
		
		// 0  1  2
		// 7     3
		// 6  5  4
		for( var i = 0; i < this.handles.length; i++ ) {
			switch( i ) {
				case 0:
					this.handles[i].x = x - (this.handles[i].w / 2);
					this.handles[i].y = y - (this.handles[i].h / 2);
					this.handles[i].draw(context);
					break;
				case 1:
					this.handles[i].x = x + Math.round(w / 2) - (this.handles[i].w / 2);
					this.handles[i].y = y - (this.handles[i].h / 2);
					this.handles[i].draw(context);
					break;
				case 2:
					this.handles[i].x = x + w - (this.handles[i].w / 2);
					this.handles[i].y = y - (this.handles[i].h / 2);
					this.handles[i].draw(context);
					break;
				case 3:
					this.handles[i].x = x + w - (this.handles[i].w / 2);
					this.handles[i].y = y + Math.round(h / 2) - (this.handles[i].w / 2);
					this.handles[i].draw(context);
					break;
				case 4:
					this.handles[i].x = x + w - (this.handles[i].w / 2);
					this.handles[i].y = y + h - (this.handles[i].w / 2);
					this.handles[i].draw(context);
					break;
				case 5:
					this.handles[i].x = x + Math.round(w / 2) - (this.handles[i].w / 2);
					this.handles[i].y = y + h - (this.handles[i].w / 2);
					this.handles[i].draw(context);
					break;
				case 6:
					this.handles[i].x = x - (this.handles[i].w / 2);
					this.handles[i].y = y + h - (this.handles[i].w / 2);
					this.handles[i].draw(context);
					break;
				case 7:
					this.handles[i].x = x - (this.handles[i].w / 2);
					this.handles[i].y = y + Math.round(h / 2) - (this.handles[i].w / 2);
					this.handles[i].draw(context);
					break;
			}
		}
	}
	
	ShapeObject.prototype.resize = function() {
		switch( resize ) {
			case 0:
				this.w += this.x - mx;
				this.h += this.y - my;
				this.x = mx;
				this.y = my;
				break;
			case 1:
				this.h += this.y - my;
				this.y = my;
				break;
			case 2:
				this.w = mx - this.x;
				this.h += this.y - my;
				this.y = my;
				break;
			case 3:
				this.w = mx - this.x;
				break;
			case 4:
				this.w = mx - this.x;
				this.h = my - this.y;
				break;
			case 5:
				this.h = my - this.y;
				break;
			case 6:
				this.w += this.x - mx;
				this.h = my - this.y;
				this.x = mx;
				break;
			case 7:
				this.w += this.x - mx;
				this.x = mx;
				break;
			default:
				break;
		}
	}
	
	/*************************************************************************/
		
		
	RectObject.prototype = new ShapeObject;
	RectObject.prototype.constructor = RectObject;
	
	function RectObject(do_handles) {
		ShapeObject.call(this, do_handles);
		this.class_name = 'RectObject';
	}
	
	RectObject.prototype.draw = function(context, do_alpha) {		
		context.globalAlpha = typeof do_alpha == 'undefined' ? this.fill_alpha : 1;
		context.fillStyle = this.fill_style;
		
		if( this.stroke_alpha != 1 ) {
			var minx = Math.min(this.x, this.x + this.w);
			var miny = Math.min(this.y, this.y + this.h);
			context.fillRect(minx + this.line_width/2, miny + this.line_width/2, Math.abs(this.w) - this.line_width, Math.abs(this.h) - this.line_width);
		}
		else {
			context.fillRect(this.x, this.y, this.w, this.h);
		}

		context.globalAlpha = typeof do_alpha == 'undefined' ? this.stroke_alpha : 1;
		context.strokeStyle = this.stroke_style;
		context.lineWidth = this.line_width;
		context.strokeRect(this.x, this.y, this.w, this.h);
	}
	
	/*************************************************************************/
		
		
	EllipseObject.prototype = new ShapeObject;
	EllipseObject.prototype.constructor = EllipseObject;
		
	function EllipseObject(do_handles) {
		ShapeObject.call(this, do_handles);	
		this.class_name = 'EllipseObject';
		this.KAPPA = 0.5522848;
	}
	
	EllipseObject.prototype.draw = function(context, do_alpha) {
		context.beginPath();

		if( this.stroke_alpha != 1 ) {	
			var minx = Math.min(this.x, this.x + this.w);
			var miny = Math.min(this.y, this.y + this.h);
			
			var ox = ((Math.abs(this.w) - this.line_width) / 2) * this.KAPPA;
			var oy = ((Math.abs(this.h) - this.line_width) / 2) * this.KAPPA;
			var xe = minx + this.line_width/2 + Math.abs(this.w) - this.line_width;
			var ye = miny + this.line_width/2 + Math.abs(this.h) - this.line_width;
			var xm = minx + this.line_width/2 + ((Math.abs(this.w) - this.line_width) / 2);
			var ym = miny + this.line_width/2 + ((Math.abs(this.h) - this.line_width) / 2);
		
			context.moveTo(minx + this.line_width/2, ym);
			context.bezierCurveTo(minx + this.line_width/2, ym - oy, xm - ox, miny + this.line_width/2, xm, miny + this.line_width/2);
			context.bezierCurveTo(xm + ox, miny + this.line_width/2, xe, ym - oy, xe, ym);
			context.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
			context.bezierCurveTo(xm - ox, ye, minx + this.line_width/2, ym + oy, minx + this.line_width/2, ym);
		}
		else {
			var ox = (this.w / 2) * this.KAPPA;
			var oy = (this.h / 2) * this.KAPPA;
			var xe = this.x + this.w;
			var ye = this.y + this.h;
			var xm = this.x + (this.w / 2);
			var ym = this.y + (this.h / 2);
			
			context.moveTo(this.x, ym);
			context.bezierCurveTo(this.x, ym - oy, xm - ox, this.y, xm, this.y);
			context.bezierCurveTo(xm + ox, this.y, xe, ym - oy, xe, ym);
			context.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
			context.bezierCurveTo(xm - ox, ye, this.x, ym + oy, this.x, ym);
		}
		context.closePath();

		context.globalAlpha = typeof do_alpha == 'undefined' ? this.fill_alpha : 1;
		context.fillStyle = this.fill_style;
		context.fill();
		
		if( this.stroke_alpha != 1 ) {	
			var ox = (this.w / 2) * this.KAPPA;
			var oy = (this.h / 2) * this.KAPPA;
			var xe = this.x + this.w;
			var ye = this.y + this.h;
			var xm = this.x + (this.w / 2);
			var ym = this.y + (this.h / 2);
		
			context.beginPath();
			context.moveTo(this.x, ym);
			context.bezierCurveTo(this.x, ym - oy, xm - ox, this.y, xm, this.y);
			context.bezierCurveTo(xm + ox, this.y, xe, ym - oy, xe, ym);
			context.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
			context.bezierCurveTo(xm - ox, ye, this.x, ym + oy, this.x, ym);
			context.closePath();
		}
				
		context.globalAlpha = typeof do_alpha == 'undefined' ? this.stroke_alpha : 1;
		context.strokeStyle = this.stroke_style;
		context.lineWidth = this.line_width;
		context.stroke();
	}
	
	/*************************************************************************/
	
	
	TriangleObject.prototype = new ShapeObject;
	TriangleObject.prototype.constructor = TriangleObject;
		
	function TriangleObject(do_handles) {
		ShapeObject.call(this, do_handles);
		this.class_name = 'TriangleObject';
	}
	
	TriangleObject.prototype.draw = function(context, do_alpha) {						 						
		if( this.stroke_alpha != 1 ) {
			
			if( this.w != 0 ) {
				var l = Math.abs(Math.round(this.line_width / Math.sin(Math.atan(this.h/(this.w/2)))));
						
				if( Math.abs(this.h) >= this.line_width && l <= Math.abs(this.w) ) {
					context.beginPath();
			
					if( this.w > 0 && this.h > 0 ) {
						context.moveTo(this.x + l - this.line_width/2, this.y + this.line_width/2 + this.h - this.line_width);
						context.lineTo(this.x + this.line_width/2 + this.w - l, this.y + this.line_width/2 + this.h - this.line_width);
						context.lineTo(this.x + (this.w/2), this.y + this.line_width/2);
						context.lineTo(this.x + l - this.line_width/2, this.y + this.line_width/2 + this.h - this.line_width);
					}
					else if( this.w > 0 ) {
						context.moveTo(this.x + l - this.line_width/2, this.y - this.line_width/2 + this.h + this.line_width);
						context.lineTo(this.x + this.line_width/2 + this.w - l, this.y - this.line_width/2 + this.h + this.line_width);
						context.lineTo(this.x + (this.w/2), this.y - this.line_width/2);
						context.lineTo(this.x + l - this.line_width/2, this.y - this.line_width/2 + this.h + this.line_width);
					}
					else if( this.h > 0 ){
						context.moveTo(this.x - l + this.line_width/2, this.y + this.line_width/2 + this.h - this.line_width);
						context.lineTo(this.x - this.line_width/2 + this.w + l, this.y + this.line_width/2 + this.h - this.line_width);
						context.lineTo(this.x + (this.w/2), this.y + this.line_width/2);
						context.lineTo(this.x - l + this.line_width/2, this.y + this.line_width/2 + this.h - this.line_width);
					}
					else {
						context.moveTo(this.x - l + this.line_width/2, this.y - this.line_width/2 + this.h + this.line_width);
						context.lineTo(this.x - this.line_width/2 + this.w + l, this.y - this.line_width/2 + this.h + this.line_width);
						context.lineTo(this.x + (this.w/2), this.y - this.line_width/2);
						context.lineTo(this.x - l + this.line_width/2, this.y - this.line_width/2 + this.h + this.line_width);
					}
				
					context.closePath();
					context.globalAlpha = typeof do_alpha == 'undefined' ? this.fill_alpha : 1;
					context.fillStyle = this.fill_style;
					context.fill();
				}
			}
		} else {
			context.beginPath();
			context.moveTo(this.x, this.y + this.h);
			context.lineTo(this.x + this.w, this.y + this.h);
			context.lineTo(this.x + (this.w/2), this.y);
			context.lineTo(this.x, this.y + this.h);
			context.closePath();
			
			context.globalAlpha = typeof do_alpha == 'undefined' ? this.fill_alpha : 1;
			context.fillStyle = this.fill_style;
			context.fill();
		}
	
		if( this.stroke_alpha != 1 ) {
			context.beginPath();
			context.moveTo(this.x, this.y + this.h);
			context.lineTo(this.x + this.w, this.y + this.h);
			context.lineTo(this.x + (this.w/2), this.y);
			context.lineTo(this.x, this.y + this.h);
			context.closePath();
		}
	
		context.globalAlpha = typeof do_alpha == 'undefined' ? this.stroke_alpha : 1;
		context.strokeStyle = this.stroke_style;
		context.lineWidth = this.line_width;
		context.stroke();
	}

	/*************************************************************************/


	RTriangleObject.prototype = new ShapeObject;
	RTriangleObject.prototype.constructor = RTriangleObject;
	
	function RTriangleObject(do_handles) {
		ShapeObject.call(this, do_handles);
		this.class_name = 'RTriangleObject';
	}

	RTriangleObject.prototype.draw = function(context, do_alpha) {		 			
		if( this.stroke_alpha != 1 ) {
			
			if( this.w != 0 && this.h != 0 ) {
				var l = Math.abs(Math.round(this.line_width / Math.sin(Math.atan(this.h/this.w))));
				var l2 = Math.abs(Math.round(this.line_width / Math.sin(Math.atan(this.w/this.h))));
			
				if( Math.abs(this.h) >= this.line_width && l <= Math.abs(this.w) ) {
					context.beginPath();
				
					if( this.w > 0 && this.h > 0 ) {	
						context.moveTo(this.x + this.line_width/2, this.y + this.line_width/2 + this.h - this.line_width);
						context.lineTo(this.x + this.line_width/2 + this.w - l, this.y  + this.line_width/2 + this.h - this.line_width);
						context.lineTo(this.x + this.line_width/2, this.y + l2 - this.line_width/2);
					}
					else if( this.w > 0 ) {
						context.moveTo(this.x + this.line_width/2, this.y - this.line_width/2 + this.h + this.line_width);
						context.lineTo(this.x + this.line_width/2 + this.w - l, this.y - this.line_width/2 + this.h + this.line_width);
						context.lineTo(this.x + this.line_width/2, this.y - l2 + this.line_width/2);
					}
					else if( this.h > 0 ) {
						context.moveTo(this.x - this.line_width/2, this.y + this.line_width/2 + this.h - this.line_width);
						context.lineTo(this.x - this.line_width/2 + this.w + l, this.y  + this.line_width/2 + this.h - this.line_width);
						context.lineTo(this.x - this.line_width/2, this.y + l2 - this.line_width/2);
					}
					else {
						context.moveTo(this.x - this.line_width/2, this.y - this.line_width/2 + this.h + this.line_width);
						context.lineTo(this.x - this.line_width/2 + this.w + l, this.y - this.line_width/2 + this.h + this.line_width);
						context.lineTo(this.x - this.line_width/2, this.y - l2 + this.line_width/2);
					}
				
					context.closePath();
					context.globalAlpha = typeof do_alpha == 'undefined' ? this.fill_alpha : 1;
					context.fillStyle = this.fill_style;
					context.fill();
				}
			}
		}
		else {
			context.beginPath();
			context.moveTo(this.x, this.y + this.h);
			context.lineTo(this.x + this.w, this.y + this.h);
			context.lineTo(this.x, this.y);
			context.closePath();
			
			context.globalAlpha = typeof do_alpha == 'undefined' ? this.fill_alpha : 1;
			context.fillStyle = this.fill_style;
			context.fill();
		}
		
		if( this.stroke_alpha != -1 ) {
			context.beginPath();
			context.moveTo(this.x, this.y + this.h);
			context.lineTo(this.x + this.w, this.y + this.h);
			context.lineTo(this.x, this.y);
			context.closePath();
		}
		
		context.globalAlpha = typeof do_alpha == 'undefined' ? this.stroke_alpha : 1;
		context.strokeStyle = this.stroke_style;
		context.lineWidth = this.line_width;
		context.stroke();
	}

	/*************************************************************************/
	
	
	LineObject.prototype = new ShapeObject;
	LineObject.prototype.constructor = LineObject;
		
	function LineObject(do_handles) {
		ShapeObject.call(this, do_handles);
		this.class_name = 'LineObject';	
	}
	
	LineObject.prototype.draw = function(context, do_alpha) {		
		context.beginPath();
		context.moveTo(this.x, this.y);
		context.lineTo(this.x + this.w, this.y + this.h);
		context.closePath();
		
		context.globalAlpha = typeof do_alpha == 'undefined' ? this.stroke_alpha : 1;
		context.strokeStyle = this.stroke_style;
		context.lineWidth = this.line_width;
		context.stroke();
	}

	/*************************************************************************/
	
	
	TextObject.prototype = new ShapeObject;
	TextObject.prototype.constructor = TextObject;
		
	function TextObject(do_handles) {
		ShapeObject.call(this, do_handles);
		this.class_name = 'TextObject';
		
		this.editing = false;
		
		this.font_size = font_size;
		this.font_family = font_family;
		this.font_style = font_style;
		this.font_bold = font_bold;
		this.font_italic = font_italic;
		this.font_underline = font_underline;
		this.font_align = font_align;
		
		this.font_alpha = font_alpha;
		
		this.text = "";	
	}
	
	TextObject.prototype.copy = function () {
		var obj = ShapeObject.prototype.copy.call(this);
		
		obj.editing = this.editing;
		obj.font_size = this.font_size;
		obj.font_family = this.font_family;
		obj.font_style = this.font_style;
		obj.font_bold = this.font_bold;
		obj.font_italic = this.font_italic;
		obj.font_underline = this.font_underline;
		obj.font_align = this.font_align;
		obj.font_alpha = this.font_alpha;
		obj.text = this.text;
		
		return obj;
	}
	
	TextObject.prototype.showEdit = function() {		
		buf_textarea.value = this.text;
		this.editing = true;
	}
	
	TextObject.prototype.deselect = function() {
		ShapeObject.prototype.deselect.call(this);
		
		if( this.editing == true ) {
			this.editing = false;
						
			var val = buf_textarea.value;
			if( this.text != val ) {
				addHistory('propchange', this);
				this.text = val.trim();			
				syncObject('propchange', this);	
			}

			buf_textarea.style.display = 'none';
			buf_textarea.value = '';
		}
	}
	
	TextObject.prototype.drawEdit = function() {
		var minx = Math.min(this.x, this.x + this.w);
		var miny = Math.min(this.y, this.y + this.h);
		
		buf_textarea.style.left = (minx + container.offsetLeft + canvas.offsetLeft + this.line_width/2 - 1) + 'px';
		buf_textarea.style.top = (miny + container.offsetTop + canvas.offsetTop + this.line_width/2 - 1) + 'px';
		buf_textarea.style.width = (Math.abs(this.w) - this.line_width - 4) + 'px';
		buf_textarea.style.border = 'none';
		buf_textarea.style.display = 'block';
		
		buf_span.style.fontFamily = buf_textarea.style.fontFamily = this.font_family;
		buf_span.style.fontSize = buf_textarea.style.fontSize = this.font_size + 'px';
		buf_span.style.lineHeight = buf_textarea.style.lineHeight = this.font_size + 'px';
		buf_textarea.style.color = this.font_style;
		buf_textarea.style.backgroundColor = 'transparent';
		buf_textarea.style.textAlign = this.font_align;
		buf_span.style.fontWeight = buf_textarea.style.fontWeight = this.font_bold == true ? 'bold' : '';
		buf_span.style.fontStyle = buf_textarea.style.fontStyle = this.font_italic == true ? 'italic' : '';
		buf_span.style.textDecoration = buf_textarea.style.textDecoration = this.font_underline == true ? 'underline' : '';
		
		textareaOnKeyUp();
		
		buf_textarea.focus();
	}
	
	TextObject.prototype.draw = function(context, do_alpha) {		
		// bounding rect
		context.globalAlpha = typeof do_alpha == 'undefined' ? this.fill_alpha : 1;
		context.fillStyle = this.fill_style;

		if( this.stroke_alpha != 1 ) {
			var minx = Math.min(this.x, this.x + this.w);
			var miny = Math.min(this.y, this.y + this.h);
			context.fillRect(minx + this.line_width/2, miny + this.line_width/2, Math.abs(this.w) - this.line_width, Math.abs(this.h) - this.line_width);
		}
		else {
			context.fillRect(this.x, this.y, this.w, this.h);
		}

		context.globalAlpha = typeof do_alpha == 'undefined' ? this.stroke_alpha : 1;
		context.strokeStyle = this.stroke_style;
		context.lineWidth = this.line_width;
		context.strokeRect(this.x, this.y, this.w, this.h);
		
		
		if( this.editing == true ) {
			this.drawEdit();
		}
		else {
			if( this.text !== "" ) {
				this.drawText(context, this.text, this.font_size, this.font_family, this.font_style, this.font_align, this.font_bold, this.font_italic, this.font_underline, this.font_alpha);
			}
			else {
				this.drawText(context, instruction_text, 12, 'Helvetica', '#BCBCBC', 'center', false, false, false, 1);
			}
		}
	}
	
	TextObject.prototype.drawText = function(context, text, size, family, fill, textalign, font_bold, font_italic, font_underline, font_alpha) {
		if( context == gcontext ) {
			return;
		}
		
		context.globalAlpha = font_alpha;
		
		context.font = size + 'px ' + family;
		context.font = font_bold == true ? 'bold ' + context.font : context.font;
		context.font = font_italic == true ? 'italic ' + context.font : context.font;
				
		context.fillStyle = fill;
		context.textBaseline = 'middle';
		context.textAlign = textalign;
		
		var tmp = text.split('\n');
		var lines = [];
		for( var i in tmp ) {
			lines.push( tmp[i].split(' ') );
		}
		
		var i = 0;
		do {			
			while( context.measureText(lines[i].join(' ')).width > Math.abs(this.w) ) {	
				if( lines[i].length > 1) { //clipping words
					if( i+1 == lines.length ) {
						lines[i+1] = [];
					}
					lines[i+1].unshift( lines[i].pop() );
				}
				else { //clipping letters 					
					lines[i][0] = lines[i][0].substring(0, lines[i][0].length-1);
				}
			}
			i++;
		} while( i < lines.length)
		
		if( size < Math.abs(this.h) ) {
			var text_height = lines.length * size;
		
			for( var i in lines ) {
				var line = lines[i].join(' ');
			
				var twidth = context.measureText(line).width;
			
				switch( textalign ) {
					case 'left':
						var x = Math.min(this.x, this.x + this.w) + this.line_width/2;
						var ux = x;
						break;
					case 'center':
						var x = this.x + Math.round(this.w/2);
						var ux = x - twidth/2;
						break;
					case 'right':
						var x = Math.max(this.x, this.x + this.w) - this.line_width/2;
						var ux = x - twidth;
						break;
					default:
						break;
				}
				
				// this is for middle baseline
				var y = this.y + this.h/2 + (size * i) - (text_height-size)/2;
				
				if( text_height > Math.abs(this.h) ) {
					y += (text_height - Math.abs(this.h))/2;
				}
			
				if( y + size/2 <= Math.max(this.y, this.y + this.h) - this.line_width/2 ) {
					context.fillText(line, x, y);
					
					if( font_underline == true ) {
						
						// 1 px line fix
						var uy = y + size/2;
						if( uy == Math.round(uy) ) {
							uy -= 0.5;
						}
												
						context.beginPath();						
						context.moveTo(ux, uy);						
						context.lineTo(ux + twidth, uy);
						context.closePath();

						context.strokeStyle = fill;
						context.lineWidth = 1;
						context.stroke();
					}	
				}
			}
		}
	}
	
	/*************************************************************************/
	
	
	BrushObject.prototype = new ShapeObject;
	BrushObject.prototype.constructor = BrushObject;
		
	function BrushObject(do_handles) {		
		ShapeObject.call(this, do_handles);		
		this.class_name = 'BrushObject';	
		
		this.points = [];
		this.maxx = this.x;
		this.maxy = this.y;
				
		this.addPoint(this.x + this.w, this.y + this.h);
	}
	
	BrushObject.prototype.copy = function () {
		var obj = ShapeObject.prototype.copy.call(this);
		
		obj.points = [];
		for( var i in this.points ) {
			obj.points.push({x:this.points[i].x, y:this.points[i].y});
		}
		obj.maxx = this.maxx;
		obj.maxy = this.maxy;
		
		return obj;
	}
	
	BrushObject.prototype.addPoint = function(x, y) {
		this.x = Math.min(this.x, x);
		this.y = Math.min(this.y, y);
		this.maxx = Math.max(this.maxx, x);
		this.maxy = Math.max(this.maxy, y);
		
		this.w = this.maxx - this.x;
		this.h = this.maxy - this.y;
				
		var p = {x:x, y:y};
		if( this.points.length > 0 ) {
			if( this.points[this.points.length-1] != p ) {		
				this.points.push(p);
			}
		}
		else {
			this.points.push(p);
		}
	}
	
	BrushObject.prototype.draw = function(context, do_alpha, do_fill) {
		context.beginPath();
		context.moveTo(this.points[0].x, this.points[0].y);
		
		if( this.points.length == 1 ) {
			context.lineTo(this.points[0].x+1, this.points[0].y+1);
		}
		else {
			for( var i in this.points ) {
				context.lineTo(this.points[i].x, this.points[i].y);
			}
		}
		
		// this is just a hack for poly object (should not be used with brush object)
		if( this.created == true && typeof do_fill != 'undefined' ) {
			context.globalAlpha = typeof do_alpha == 'undefined' ? this.fill_alpha : 1;
			context.fillStyle = this.fill_style;
			context.fill();
		}
		
		context.globalAlpha = typeof do_alpha == 'undefined' ? this.stroke_alpha : 1;
		context.strokeStyle = this.stroke_style;
		context.lineWidth = this.line_width;
		context.stroke();
		
		context.closePath();
	}
	
	BrushObject.prototype.position = function() {
		var sx = this.x;
		var sy = this.y;
		
		ShapeObject.prototype.position.call(this);
		
		for( var i in this.points ) {
			this.points[i].x += this.x - sx;
			this.points[i].y += this.y - sy;
		}
	}
	
	BrushObject.prototype.resize = function() {
		for( var i in this.points ) {				
			this.points[i].rx = this.w > 0 ? (this.points[i].x - this.x) / this.w : this.points[i].rx;
			this.points[i].ry = this.h > 0 ? (this.points[i].y - this.y) / this.h : this.points[i].ry;
		}
		
		ShapeObject.prototype.resize.call(this);
		
		for( var i in this.points ) {			
			this.points[i].x = (this.points[i].rx * this.w) + this.x;
			this.points[i].y = (this.points[i].ry * this.h) + this.y;
		}
	}
	
	/*************************************************************************/
	
	
	PolyObject.prototype = new BrushObject;
	PolyObject.prototype.constructor = PolyObject;
		
	function PolyObject(do_handles) {		
		BrushObject.call(this, do_handles);		
		this.class_name = 'PolyObject';	
	}
	
	PolyObject.prototype.draw = function(context, do_alpha) {
		BrushObject.prototype.draw.call(this, context, do_alpha, true);		
	}
	
	/*************************************************************************/
	
	
	ImageObject.prototype = new ShapeObject;
	ImageObject.prototype.constructor = ImageObject;
		
	function ImageObject(do_handles) {
		ShapeObject.call(this, do_handles);
		this.class_name = 'ImageObject';	
			
		this.url = null;
		
		this.image = new Image(); 
		this.image._parent = this;
		this.image._loaded = false;
		this.image.onload = this.onload;
	}
	
	ImageObject.prototype.loadImage = function() {					
		if( !this.image._loaded ) {	
			this.image.src = this.url;
		}
	}
	
	ImageObject.prototype.onload = function() {				
		var o = this._parent;
		if( o.created == false ) {							
			if( this.width > context.canvas.width - 50 || this.height > context.canvas.height - 50 ) {
				var dy = this.height - context.canvas.height + 50;
				var dx = this.width - context.canvas.width + 50;
							
				if( dy > dx ) {
					this.width -= (dy / this.height) * this.width;
					this.height -= dy;
				}
				else { 
					this.height -= (dx / this.width) * this.height;
					this.width -= dx;
				}
			}
		
			o.w = this.width + o.line_width;
			o.h = this.height + o.line_width;
			o.x = Math.min(context.canvas.width - o.w, Math.max(o.x - Math.round(o.w/2) - o.line_width/2, 0));
			o.y = Math.min(context.canvas.height - o.h, Math.max(o.y - Math.round(o.h/2) - o.line_width/2, 0));
			
			o.created = true;
			addHistory('create', o);
			syncObject('create', o);							
		}		
		this._loaded = true;	

		// Hack for Firefox
		setTimeout( redraw, 100);
	}
	
	ImageObject.prototype.copy = function () {				
		var obj = ShapeObject.prototype.copy.call(this);
		obj.url = this.url;
		obj.image = this.image;
		
		return obj;
	}
	
	ImageObject.prototype.draw = function(context, do_alpha) {		
		context.globalAlpha = typeof do_alpha == 'undefined' ? this.fill_alpha : 1;
		context.fillStyle = this.fill_style;
		context.fillRect(this.x + this.line_width/2, this.y + this.line_width/2, this.w - this.line_width, this.h - this.line_width);
		
		context.globalAlpha = typeof do_alpha == 'undefined' ? this.stroke_alpha : 1;
		context.strokeStyle = this.stroke_style;
		context.lineWidth = this.line_width;
		context.strokeRect(this.x, this.y, this.w, this.h);
				
		context.globalAlpha = 1;
																																																			
		if( this.url !== null && this.image._loaded == false ) {
			this.loadImage();
		}
		else if( this.image._loaded == true ) {	
			// So Firefox doesn't shit it's pants ...				
			var x = this.x + this.line_width/2;
			var y = this.y + this.line_width/2;
			var w = this.w - this.line_width;
			var h = this.h - this.line_width;
			
			if( w < 0 ) {
				x = x + w;
				w = Math.abs(w);
			}
			
			if( h < 0 ) {
				y = y + h;
				h = Math.abs(h);
			}
						
			context.drawImage(this.image, x, y, w, h);
		}
	}
}( window.NRCWhiteboard = window.NRCWhiteboard || {}, NRCSocket ));