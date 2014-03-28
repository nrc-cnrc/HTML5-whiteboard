#!/php -q
<?php  /*  >php -q server.php  */

/*

	This whole script should probably be re-written, in Python.
	It's sufficient for demo purposes, though.

*/

error_reporting(E_ALL);
set_time_limit(0);
ob_implicit_flush();

$master  = WebSocket("0.0.0.0",12345);
$sockets = array($master);
$users   = array();
$debug   = false;

/*********************************************************************/
$db_host  = ':/Applications/MAMP/tmp/mysql/mysql.sock';
$db_user  = 'root';
$db_pass  = 'root';
$db_db	  = 'htmlwhiteboard';

$db_link = mysql_connect($db_host, $db_user, $db_pass);
if( !$db_link ) {
	die('Cound not connect to MySQL: ' . mysql_error());
}

$db_selected = mysql_select_db($db_db, $db_link);

if( !$db_selected ) {
	die("Can't use {$db_db}: " . mysql_error());
}
/*********************************************************************/

while(true){
  $changed = $sockets;
  socket_select($changed,$write=NULL,$except=NULL, NULL);

  foreach($changed as $socket){	
    if( $socket == $master ){
      $client = socket_accept($master);
      if( $client < 0 ){ 
		console("socket_accept() failed"); continue; 
	  }
      else{ 
		connect($client); 
	  }
    }
    else{	
	  $buf = socket_read($socket,2048);

      if(empty($buf)){ 
		disconnect($socket); 
	  }
      else{
        $user = getuserbysocket($socket);
        if(!$user->handshake){ 
			dohandshake($user,$buf); 
		}
        else{ 
			$read = $buf;
	
			while( !empty($buf) && ord(substr($read,-1)) != 255 ) {
				$buf = socket_read($socket,2048);				
				$read .= $buf;
			}
		
			// For some reason, every now and then messages are grouped
			$msgs = explode(chr(255), $read);			
			foreach( $msgs as $msg ) {
				if(strlen($msg) > 2) {
					process($user,$msg.chr(255)); 
				}	
			}
		}
      }
    }
  }
}

//---------------------------------------------------------------
function process($user,$msg){	
	global $users;
	
	$user->last_message_time = time();
  	$umsg = unwrap($msg);
  	console("< ".$umsg);
	$msg_obj = json_decode($umsg, true);
	$msg_obj['slot'] = $user->id;	
	$type = $msg_obj['type'];
	
	switch( $type ) {
		case 'KEEPALIVE':
			if( rand(0, 1000) & 1 ) {
				console('running keep alive checks ...');

				$time = time();
				foreach($users as $u) {
					if( $time - $u->last_message_time > 35 ) {
						disconnect($u->socket);
					}
				}
			}
		
			break;
		
		case 'JOIN': // JOIN <WHITEBOARD_ID>		
			$init = $user->id == null;
		
			$user->whiteboard_id = $msg_obj['key'];				
			
			$ids = array();
			foreach( $users as $u ) {
				if( $u->whiteboard_id == $user->whiteboard_id && $u !== $user ) {
					send($user->socket, json_encode(array('type'=>'JOIN', 'name' => $u->name, 'slot' => $u->id)));
					array_push($ids, $u->id);
				}
			}
			
			sort($ids);
			$user->id = 0;
			foreach( $ids as $id ) {
				if( $id == $user->id ) {
					$user->id += 1;
				}
				else {
					break;
				}
			}
			
			if( $user->name == 'Guest' ) {
				$user->name = "Guest-{$user->id}";
			}
			
			send($user->socket, json_encode(array('type' => 'JOINED', 'slot' => $user->id)));
			
			$query = sprintf("SELECT * FROM `boards` WHERE `wb_id` = '%s' ORDER BY `index`", 
				$user->whiteboard_id
			);
			$result = mysql_query($query);
		
			while( $row = mysql_fetch_assoc($result) ) {
				send($user->socket, json_encode(array('type'=>'JCREATE', 'obj'=>$row['obj'], 'slot' => $user->id)));
			}
				
			if( $init == true ) {
				broadcast($user, json_encode(array('type' => 'JOIN', 'name' => $user->name, 'slot' => $user->id)));
			}
			
			break;
			
		default:
			if( $type == 'DELETE' || $type == 'UCREATE' ) {
				$obj = json_decode($msg_obj['obj'], true);
				$query = sprintf("DELETE FROM `boards` WHERE `wb_id` = '%s' AND `obj_id` = '%s';", 
					mysql_real_escape_string($user->whiteboard_id),
					mysql_real_escape_string($obj['id'])
				);
			}
			else if( $type == 'CLEAR' ) {
				$query = sprintf("DELETE FROM `boards` WHERE `wb_id` = '%s';", 
					mysql_real_escape_string($user->whiteboard_id)
				);
			}
			else {
				$json = $msg_obj['obj'];
				$obj = json_decode($json, true);			
					
				$query = sprintf("REPLACE INTO `boards` (`wb_id`, `obj_id`, `usr_id`, `obj`, `index`) VALUES ('%s', '%s', '%s', '%s', '%s');", 
					mysql_real_escape_string($user->whiteboard_id),
					mysql_real_escape_string($obj['id']),
					mysql_real_escape_string($user->id),
					mysql_real_escape_string($json),
					mysql_real_escape_string($obj['index'])
				);
			}

			$result = mysql_query($query);
			if( !$result ) {
				say('Error inserting: ' . mysql_error());
			}
		
			broadcast($user, json_encode($msg_obj));
			break;
	}
}

// returns count of users on the whiteboard
function broadcast($from_user, $msg) {
	global $users;
	
	foreach( $users as $user ) {
		if( $user->id != $from_user->id && $user->whiteboard_id == $from_user->whiteboard_id ) {
			send($user->socket, $msg);
		}
	}
}

function send($client,$msg){
  console("> ".$msg);
  $msg = wrap($msg);
  socket_write($client,$msg,strlen($msg));
}

function WebSocket($address,$port){
  $master=socket_create(AF_INET, SOCK_STREAM, SOL_TCP)     or die("socket_create() failed");
  socket_set_option($master, SOL_SOCKET, SO_REUSEADDR, 1)  or die("socket_option() failed");
  socket_bind($master, $address, $port)                    or die("socket_bind() failed");
  socket_listen($master,20)                                or die("socket_listen() failed");
  echo "Server Started : ".date('Y-m-d H:i:s')."\n";
  echo "Master socket  : ".$master."\n";
  echo "Listening on   : ".$address." port ".$port."\n\n";
  return $master;
}

function connect($socket){
  global $sockets,$users;
  $user = new User();
  $user->socket = $socket;
  $user->last_message_time = time();
  array_push($users,$user);
  array_push($sockets,$socket);
  console($socket." CONNECTED!");
}

function disconnect($socket){	
  global $sockets,$users;
  $found=null;
  $n=count($users);
  for($i=0;$i<$n;$i++){
    if($users[$i]->socket==$socket){ 
		$found=$i; 
		
		broadcast($users[$i], json_encode(array('type' => 'DISCONNECT', 'slot' => $users[$i]->id)));
		
		$query = sprintf("SELECT * FROM `boards` WHERE wb_id = '%s' AND usr_id = '%s'", 
			mysql_real_escape_string($users[$i]->whiteboard_id), 
			mysql_real_escape_string($users[$i]->id)
		);
		$result = mysql_query($query);
		
		while( $row = mysql_fetch_assoc($result) ) {
			$obj = json_decode($row['obj'], true);
			
			if( $obj['selected'] == true ) {
				$obj['selected'] = false;
							
				$query = sprintf("REPLACE INTO `boards` (`wb_id`, `obj_id`, `usr_id`, `obj`, `index`) VALUES ('%s', '%s', '%s', '%s', '%s');", 
					mysql_real_escape_string($users[$i]->whiteboard_id),
					mysql_real_escape_string($obj['id']),
					mysql_real_escape_string($users[$i]->id),
					mysql_real_escape_string(json_encode($obj)),
					mysql_real_escape_string($obj['index'])
				);
				$r = mysql_query($query);
			
				if( !$r ) {
					say('Error inserting: ' . mysql_error());
				}
			}
		}
		
		break; 
	}
  }
  if(!is_null($found)){ array_splice($users,$found,1); }
  $index = array_search($socket,$sockets);
  socket_close($socket);
  console($socket." DISCONNECTED!");
  if($index>=0){ array_splice($sockets,$index,1); }
}

function dohandshake($user,$buffer){
  console("\nRequesting handshake...");
  console($buffer);
  list($resource,$host,$origin,$strkey1,$strkey2,$data) = getheaders($buffer);
  console("Handshaking...");

  $pattern = '/[^\d]*/';
  $replacement = '';
  $numkey1 = preg_replace($pattern, $replacement, $strkey1);
  $numkey2 = preg_replace($pattern, $replacement, $strkey2);

  $pattern = '/[^ ]*/';
  $replacement = '';
  $spaces1 = strlen(preg_replace($pattern, $replacement, $strkey1));
  $spaces2 = strlen(preg_replace($pattern, $replacement, $strkey2));

  if ($spaces1 == 0 || $spaces2 == 0 || fmod($numkey1, $spaces1) != 0 || fmod($numkey2, $spaces2) != 0) {
	socket_close($user->socket);
	console('failed');
	return false;
  }

  $ctx = hash_init('md5');
  hash_update($ctx, pack("N", $numkey1/$spaces1));
  hash_update($ctx, pack("N", $numkey2/$spaces2));
  hash_update($ctx, $data);
  $hash_data = hash_final($ctx,true);

  $upgrade  = "HTTP/1.1 101 WebSocket Protocol Handshake\r\n" .
              "Upgrade: WebSocket\r\n" .
              "Connection: Upgrade\r\n" .
              "Sec-WebSocket-Origin: " . $origin . "\r\n" .
              "Sec-WebSocket-Location: ws://" . $host . $resource . "\r\n" .
              "\r\n" .
              $hash_data;

  socket_write($user->socket,$upgrade.chr(0),strlen($upgrade.chr(0)));
  $user->handshake=true;
  console($upgrade);
  console("Done handshaking...");
  return true;
}

function getheaders($req){
  $r=$h=$o=$key1=$key2=$data=null;
  if(preg_match("/GET (.*) HTTP/"   ,$req,$match)){ $r=$match[1]; }
  if(preg_match("/Host: (.*)\r\n/"  ,$req,$match)){ $h=$match[1]; }
  if(preg_match("/Origin: (.*)\r\n/",$req,$match)){ $o=$match[1]; }
  if(preg_match("/Sec-WebSocket-Key2: (.*)\r\n/",$req,$match)){ $key2=$match[1]; }
  if(preg_match("/Sec-WebSocket-Key1: (.*)\r\n/",$req,$match)){ $key1=$match[1]; }
  if(preg_match("/\r\n(.*?)\$/",$req,$match)){ $data=$match[1]; }
  return array($r,$h,$o,$key1,$key2,$data);
}

function getuserbysocket($socket){
  global $users;
  $found=null;
  foreach($users as $user){
    if($user->socket==$socket){ $found=$user; break; }
  }
  return $found;
}

function     say($msg=""){ echo $msg."\n"; }
function    wrap($msg=""){ return chr(0).$msg.chr(255); }
function  unwrap($msg=""){ return substr($msg,1,strlen($msg)-2); }
function console($msg=""){ global $debug; if($debug){ echo $msg."\n"; } }

class User{
  	var $id = null;
  	var $socket;
  	var $handshake;
	var $whiteboard_id;
	var $name = 'Guest';
	var $last_message_time;
}

?>
