import React from 'react';
import Canvas from './Canvas.jsx';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
class MandelBrotContainer extends React.Component {
	componentDidMount() {
		window.addEventListener('resize', () => this.resize());
	}

	resize() {
		this.props.setWidth(window.innerWidth);
		this.props.setHeight(window.innerHeight);
		this.props.start();
	}

	render() {
		return (
			<div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
				<Canvas width={this.props.width} data={this.props.data} height={this.props.height} />
			</div>
		);
	}
}
export default connect(
	state => state,
	dispatch => ({
		start: () => {
			dispatch({ type: 'start' });
		},
		setWidth: width => {
			dispatch({ type: 'setWidth', value: width });
		},
		setHeight: height => {
			dispatch({ type: 'setHeight', value: height });
		}
	})
)(MandelBrotContainer);

MandelBrotContainer.propTypes = {
	data: PropTypes.array,
	start: PropTypes.func,
	height: PropTypes.number,
	width: PropTypes.number,
	setWidth: PropTypes.func,
	setHeight: PropTypes.func
};
