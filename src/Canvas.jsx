import React from 'react';
import PropTypes from 'prop-types';
class Canvas extends React.Component {
	constructor(props) {
		super(props);
		this.offsetX = 0;
		this.offsetY = 0;
	}

	componentDidMount() {
		this.createCanvas();
		if (this.props && this.props.data && this.props.data.length) {
			this.drawData(this.props.data);
		}
		this.canvas.addEventListener('mousedown', e => this.handleMouseDown(e));
		this.canvas.addEventListener('mouseup', e => this.handleMouseUp(e));
		this.canvas.addEventListener('mousemove', e => this.handleMouseMove(e));
	}

	handleMouseDown(e) {
		//	debugger;
		//
		this.mouseDown = true;
		this.downX = e.clientX;
		this.downY = e.clientY;
		this.context = this.canvas.getContext('2d');
		const imagew = this.canvas.width;
		const imageh = this.canvas.height;
		this.moveimagedata = this.context.getImageData(0, 0, imagew, imageh);
	}

	handleMouseUp(e) {
		this.mouseDown = false;
	}

	handleMouseMove(e) {
		//	debugger;
		if (!this.mouseDown) {
			return;
		}
		this.offsetX = e.clientX - this.downX;
		this.offsetY = e.clientY - this.downY;
		const ctx = this.canvas.getContext('2d');
		const imagew = this.canvas.width;
		const imageh = this.canvas.height;
		//const imagedata = this.context.getImageData(0, 0, imagew, imageh);
		ctx.clearRect(0, 0, imagew, imageh);
		ctx.putImageData(this.moveimagedata, this.offsetX, this.offsetY);
	}

	createCanvas() {}

	drawData(data) {
		this.context = this.canvas.getContext('2d');
		const imagew = this.canvas.width;
		const imageh = this.canvas.height;
		this.imagedata = this.context.getImageData(this.offsetX, this.offsetY, imagew, imageh);
		for (const i in data) {
			const index = Number(i) * 4;
			const color = data[i];
			this.imagedata.data[index] = color >> 16;
			this.imagedata.data[index + 1] = (color >> 8) & 0xff;
			this.imagedata.data[index + 2] = color & 0xff;
			this.imagedata.data[index + 3] = 255;
		}
		this.context.putImageData(this.imagedata, this.offsetX, this.offsetY);
	}

	componentWillReceiveProps(nextProps) {
		const { width, height, data } = nextProps;
		if (width !== this.props.width || height !== this.props.height) {
			this.createCanvas();
		}
		if (data !== this.props.data) {
			this.drawData(data);
		}
	}

	setCanvas(canvas) {
		this.canvas = canvas;
	}

	render() {
		return <canvas ref={canvas => this.setCanvas(canvas)} width={this.props.width} height={this.props.height} />;
	}
}
Canvas.propTypes = {
	width: PropTypes.number,
	height: PropTypes.number,
	//Sparse array containing new pixels
	data: PropTypes.array
};

export default Canvas;
