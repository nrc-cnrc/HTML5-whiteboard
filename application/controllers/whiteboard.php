<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

class Whiteboard extends CI_Controller {

	public function index() {
		$this->load->library('user_agent');
		$this->load->view('whiteboard/index');
	}
	
	public function create() {
		$key = str_replace('.', '0', uniqid("", true));

		$this->load->database();
		$this->db->where('wbId', $key);
		
		while( $this->db->count_all_results('boards') > 0 ) {
			$key = str_replace('.', '0', uniqid("", true));
			$this->db->where('wbId', $key);
		}
		
		redirect("/whiteboard/join/${key}");
	}
	
	public function join($key=null) {
		if( $key === null || strlen($key) > 255 ) {
			show_404();
		}
		$this->load->view('whiteboard/join', array(
			'key' => $key,
			'ws_url' => $this->config->item('ws_url')
		));
	}
	
	public function image($id=null) {
		if( $id === null ) {
			show_404();
		}
		
		$this->load->database();
		$query = $this->db->get_where('images', array('id' => $id));
		foreach( $query->result() as $row ) {
			$this->output->set_header('Cache-Control: max-age=0'); // . gmdate('D, d M Y H:i:s', time()+(60*60*24*14)) . ' GMT');
			$this->output->set_header("Content-Type: {$row->mimetype}");
			$this->output->set_output(base64_decode($row->data));
			return;
		}
	}
	
	public function proxy() {
		// using x-form-data just avoids throwing a php warning
		if( $this->input->get_request_header('Content-type') == 'multipart/x-form-data' ) {
			$data = base64_encode(file_get_contents('php://input'));
			$mimetype = $this->input->get_request_header('X-file-type');
						
			$insert = array(
				'mimetype' => $mimetype,
				'data' => $data
			);
			
			$this->load->database();
			if( !$this->db->insert('images', $insert) ) {
				show_error('Error uploading file.');
			}
			
			$this->output->set_header('Cache-Control: max-age=0');
			echo site_url("whiteboard/image/{$this->db->insert_id()}");	
		}
		else {
			$url = $this->input->get('url', true);
			
			if( $url === FALSE || $url == '' ) {
				show_404();
			}
						
			$ch = curl_init($url);
			curl_setopt($ch, CURLOPT_USERAGENT, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.112 Safari/535.1");
			curl_setopt($ch, CURLOPT_HEADER, 0);
			curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
			curl_setopt($ch, CURLOPT_BINARYTRANSFER, 1);
			curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // probably not the most secure thing to do
			//$data = base64_encode(curl_exec($ch));
			$data = curl_exec($ch);
			$mimetype = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
			$retcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
			curl_close($ch);
		
			if( $retcode == 200 && preg_match('/^image/', $mimetype) ) {
				$this->output->set_header('Expires: ' . gmdate('D, d M Y H:i:s', time()+(60*60*24*14)) . ' GMT');
				$this->output->set_header('Content-Type: ' . $mimetype);
				$this->output->set_output($data);
			}
			else {
				show_error("Received {$retcode} when fetching image. Mime-type: {$mimetype}");
			}
		}
	}
}

/* End of file welcome.php */
/* Location: ./application/controllers/welcome.php */