var pc, channel, index = 0;
var progress = document.getElementsByTagName('progress')[0];
var span = document.getElementsByTagName('span')[0];
var firefox = (window.mozRTCPeerConnection != undefined);
//channel is global to prevent it being garbage collected when browser tabs changed

var PeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
pc = new PeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun.services.mozilla.com"}]});
pc.onicecandidate = function(evt) { if (pc.localDescription) prepareEmail(); };
init();

//chrome now uses SCTP data connection, in place of previous RTP

function init() {
	if (location.search == '') {
		span.textContent = 'or drag and drop';
		var input = document.getElementsByTagName('input')[0];
		input.style.display = 'inline';
		document.ondragover = function(evt) {
			evt.stopPropagation();
			evt.preventDefault();
			evt.dataTransfer.dropEffect = 'copy'; //doesn't work in FF
			};
		document.ondragenter = document.ondragover;
		document.ondrop = function(evt) {
			evt.stopPropagation();
			evt.preventDefault();
			var file = evt.dataTransfer.files[0];
			span.textContent = file.name + ' ';
			input.style.display = 'none';
			createChannel(file);
			};
		input.onchange = function() {
			span.textContent = '';
			createChannel(this.files[0]);
			};
		}
	else {
		pc.ondatachannel = function(evt) {
			console.log('Connected');
			var link = document.getElementsByTagName('a')[0];
			link.style.display = 'none';
			channel = evt.channel;
			var label = channel.label;
			var fileName = label.substr(label.indexOf(' ') + 1);
			link.download = fileName;
			link.textContent = 'Save ' + fileName;
			span.textContent = 'Receiving ' + fileName;
			//channel.onerror = function(evt) { console.log("Error: " + (evt.message ? evt.message : evt)) };
			//channel.onclose = function(evt) { console.log("Closed: "); };
			if (firefox && pc.remoteDescription.sdp.indexOf('mozilla') > 0) {
				channel.onmessage = function(evt) {
					span.textContent = '';
					link.style.display = 'inline';
					link.href = URL.createObjectURL(evt.data); //evt.data is blob
					}
				}
			else {
				channel.binaryType = 'arraybuffer';
				var fileData = new Uint8Array(parseInt(label.substring(0, label.indexOf(' '))), 10);
				progress.max = fileData.length;
				progress.style.display = 'inline';
				index = 0;
				channel.onmessage = function(evt) {
					var chunk = new Uint8Array(evt.data); // evt.data is arraybuffer
					fileData.set(chunk, index);
					progress.value = index;
					index += chunk.length;
					if (index == fileData.length) {
						span.textContent = '';
						progress.style.display = 'none';
						link.style.display = 'inline';
						link.href = URL.createObjectURL(new Blob([fileData]));
						link.onclick = function() {
							location = location.pathname;
							};
						}
					}
				}
			};
		processPeerData(location.search.substr(1));
		}
	}
	
function createChannel(file) {
	if (pc.datachannel) {
	channel = pc.createDataChannel(file.size + ' ' + file.name); //use datachannel.label to transmit file name and size
	pc.createOffer(onDescCreated, onCreateOfferError);
	channel.onopen = sendFile;
}

function sendFile() {
	document.getElementsByTagName('a')[0].style.display = 'none';
	span.textContent = span.textContent + 'sending';
	if (firefox && pc.remoteDescription.sdp.indexOf('mozilla') > 0)
		channel.send(file);
	else {
		channel.binaryType = 'arraybuffer'; //defaults to blob
		var reader = new FileReader();
		reader.onload = function() {
			progress.style.display = 'inline';
			progress.max = this.result.byteLength;
			sendChunk(this.result, 0);
			};
		reader.readAsArrayBuffer(file);
		}
}

function sendChunk(fileData, start) {
	channel.send(fileData.slice(start, start+=16384));//chunk = slice up to but not including
	if (start < fileData.byteLength) {
		progress.value = start;
		setTimeout(sendChunk, 50, fileData, start);
		}
	else {
		progress.style.display = 'none';
		span.textContent = span.textContent.slice(0, -4) + 't';
		var id = setTimeout(init, 5000);
		window.onclick = function() {
			clearTimeout(id);
			init();
			}
		}
}

function onCreateOfferError(msg) {
	logError('Error creating offer: ' + JSON.stringify(msg));
	}

function onDescCreated(desc) {
    pc.setLocalDescription(desc, onLocalDescSuccess, onLocalDescError);
	}
	
function onLocalDescSuccess() {
	console.log('Local sdp created: ' + JSON.stringify(pc.localDescription));
	prepareEmail();
	}
	
function onLocalDescError(msg) {
	logError('Local description could not be created: ' + JSON.stringify(msg));
	}

function prepareEmail() {
	//a=sendrecv can be omitted as it's the default
	var link = document.getElementsByTagName('a')[0];
	if (pc.iceGatheringState != 'complete' || link.textContent != '') return;
	var qstring = pc.localDescription.sdp;
	console.log('Sdp to email: ' + JSON.stringify(qstring));
	var data = new Array(8);
	data[0] = strBetween('o=', '\r\n').replace(/ /g, '+');
	data[1] = strBetween('m=application ', '\r\n').replace(/ /g, '+').replace(/\//g, '_');
	data[2] = strBetween('c=IN IP4 ', '\r');
	var i = qstring.indexOf(firefox ? '\r\na=sendrecv' : '\r\na=ice-ufrag:', index);
	data[3] = qstring.substring(index-1, i).replace(/\r\na=candidate:/g, '_').replace(/ generation 0/g, '').replace(/ /g, '+'); // \r\n matches a carriage return
	index = i;
	data[4] = strBetween('a=ice-ufrag:', '\r\n').replace(/\//g, '.').replace(/;/g, '_');
	index = i;
	data[5] = strBetween('a=ice-pwd:', '\r\n').replace(/\//g, '.').replace(/;/g, '_');
	if (firefox) index = 0;
	data[6] = strBetween('a=fingerprint:sha-256 ', '\r\n').replace(/:/g, '');	
	data[7] = strBetween('a=sctpmap:', '\r\n').replace(/ /g, '+');
	qstring = "?" + data.join('~');
	console.log('Email query string: ' + qstring);
	var S = " the file %0D%0A%0D%0A" + location.hostname + location.pathname;
	if (location.search == '') {
		link.textContent = 'Send email offering file transfer';
		link.href = "mailto:?subject=File transfer offer&body=Please click the link below to receive" + S + qstring;
		link.onclick = "window.open(" + link.href + ", 'mail'); event.preventDefault()"; 
		window.addEventListener('storage', function(evt) {
			processPeerData(evt.newValue);
			localStorage.clear();
			});
		}
	else {
		link.textContent = 'Send email accepting file transfer';
		link.href = "mailto:?subject=File transfer acceptance&body=Please click the link below to send" + S + "answer.htm" + qstring;
		}
	console.log('Length: ' + link.href.length);		
}

function strBetween(startStr, endStr) {
	var sdpstr = pc.localDescription.sdp;
	var start = sdpstr.indexOf(startStr, index);
	if (start < 0)
		return '';
	else {
		start+=startStr.length;
		var end = sdpstr.indexOf(endStr, start);
		index = end + endStr.length;
		return sdpstr.substring(start, end);
		}
}

function processPeerData(qstring) {
	console.log('Processing peer data');
	var SessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;
	var data = qstring.split('~');
	var sdp = new SessionDescription();
	sdp.sdp = 'v=0\r\no=' + data[0].replace(/\+/g,' ')
	+ '\r\ns=-\r\nt=0 0\r\n\a=msid-semantic: WMS\r\nm=application ' + data[1].replace(/_/, '/').replace(/\+/g,' ')
	+ '\r\nc=IN IP4 ' + data[2]
	+ data[3].replace(/_/g, '\r\na=candidate:').replace(/\+/g,' ')
	+ '\r\na=end-of-candidates'
	+ '\r\na=ice-ufrag:' + data[4].replace(/\./g, '/').replace(/_/g, ';')
	+ '\r\na=ice-pwd:' + data[5].replace(/\./g, '/').replace(/_/g, ';')
	+ '\r\na=fingerprint:sha-256 ' + data[6].replace(/(.{2})/g,'$1:').slice(0, -1)
	+ '\r\na=setup:' + ((location.search == '') ? 'active' : 'actpass')
	+ '\r\na=mid:' + (firefox ? 'sdparta_0' : 'data') + '\r\na=sctpmap:' + data[7].replace(/\+/g,' ') + '\r\n';
	sdp.type = (location.search == '') ? 'answer' : 'offer';
	console.log("sdp string:" + sdp.sdp);
	pc.setRemoteDescription(sdp, onRemoteDescSuccess, onRemoteDescError);
	}

function onRemoteDescSuccess() {
	console.log('Remote sdp successfully set');
	if (pc.remoteDescription.type == 'offer')
		pc.createAnswer(onDescCreated, onCreateAnswerError);
	else {
		console.log('Connected');
		}
	}

function onRemoteDescError(evt) {
	logError('Remote sdp could not be set: ' + (evt.message ? evt.message : evt));
	}

function onCreateAnswerError(evt) {
	logError('Error creating answer: ' + (evt.message ? evt.message : evt));
	}

function logError(msg) {
	console.log(msg);
	}