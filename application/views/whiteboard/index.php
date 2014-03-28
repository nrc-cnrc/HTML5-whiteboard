<!DOCTYPE html>
<html>
	<head>
		<link rel="stylesheet" type="text/css" href="<?php echo site_url('static/css/layout.css') ?>" />
		<link rel="stylesheet" type="text/css" href="<?php echo site_url('static/css/button.css') ?>" />
		<script type="text/javascript" src="<?php echo site_url('static/js/jquery.min.js') ?>"></script>
		<script type="text/javascript">
			$(document).ready( function() {
				$('#newbtn').click( function() {
					window.location = "<?php echo site_url('/whiteboard/create'); ?>";
				});
			});
		</script>
	</head>
	<body>
		<div class="text-center">
			<h1>NRC HTML5 Whiteboard</h1>
			<button id="newbtn" class="large">Create New Board</button>
		</div>
		<div class="text-center" style="margin-top: 15px;">
			Bugs and/or Feedback? Contact <a href="mailto:Jason.Hines@nrc-cnrc.gc.ca">Jason Hines</a>.
		</div>
		<div class="text-center" style="margin-top: 15px;">
			Currently supported browsers: Chrome (latest, recommended), Safari (latest), IE 9, FireFox (latest).
		</div>
		<div class="text-center" style="margin-top: 15px;">
			Your browser:
			<?php if ($this->agent->is_browser() ): ?>
				<?php echo $this->agent->browser() . ' ' . $this->agent->version(); ?>
			<?php endif; ?>
		</div>
		<div class="text-center" style="margin-top: 40px;">
			<h2>Instructions</h2>
			Click the tool you want to use (select for selecting, hand for moving canvas, etc.)<br />
			Click, drag, and release to create objects
		</div>
	</body>
</html>