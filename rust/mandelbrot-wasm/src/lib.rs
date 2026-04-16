use std::cell::RefCell;

struct PaletteState {
    color_scheme: u32,
    max_iterations: u32,
    data: Vec<u8>,
}

thread_local! {
    static PALETTE_STATE: RefCell<PaletteState> = RefCell::new(PaletteState {
        color_scheme: u32::MAX,
        max_iterations: 0,
        data: Vec::new(),
    });
}

#[no_mangle]
pub extern "C" fn alloc_u8(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len);
    let ptr = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    ptr
}

#[no_mangle]
pub extern "C" fn dealloc_u8(ptr: *mut u8, len: usize) {
    unsafe {
        drop(Vec::from_raw_parts(ptr, 0, len));
    }
}

#[no_mangle]
pub extern "C" fn render_lines_rgba(
    start_y: u32,
    line_count: u32,
    line_step: u32,
    width: u32,
    offsetx: f64,
    offsety: f64,
    panx: f64,
    pany: f64,
    zoom: f64,
    max_iterations: u32,
    color_scheme: u32,
    out_ptr: *mut u8,
) {
    let width_usize = width as usize;
    let line_count_usize = line_count as usize;
    let bytes_per_line = width_usize * 4;
    let total_bytes = line_count_usize * bytes_per_line;
    let out = unsafe { std::slice::from_raw_parts_mut(out_ptr, total_bytes) };
    let dx = 1.0 / zoom;
    let base_x0 = (offsetx + panx) / zoom;
    let line_step_f64 = line_step as f64;

    with_palette(color_scheme, max_iterations, |palette| {
        for line_index in 0..line_count_usize {
            let y = start_y as f64 + line_index as f64 * line_step_f64;
            let y0 = (y + offsety + pany) / zoom;
            let row_start = line_index * bytes_per_line;
            let row = &mut out[row_start..row_start + bytes_per_line];
            render_row_rgba(row, width_usize, base_x0, dx, y0, max_iterations, palette);
        }
    });
}

fn render_row_rgba(
    row: &mut [u8],
    width: usize,
    base_x0: f64,
    dx: f64,
    y0: f64,
    max_iterations: u32,
    palette: &[u8],
) {
    let mut x0 = base_x0;

    for x in 0..width {
        let iterations = mandelbrot_iterations(x0, y0, max_iterations);
        let palette_index = iterations.min(max_iterations) as usize * 4;
        let rgba_index = x * 4;
        row[rgba_index] = palette[palette_index];
        row[rgba_index + 1] = palette[palette_index + 1];
        row[rgba_index + 2] = palette[palette_index + 2];
        row[rgba_index + 3] = 255;
        x0 += dx;
    }
}

fn mandelbrot_iterations(x0: f64, y0: f64, max_iterations: u32) -> u32 {
    if is_in_main_cardioid_or_period2_bulb(x0, y0) {
        return max_iterations + 1;
    }

    let mut rx = 0.0_f64;
    let mut ry = 0.0_f64;
    let mut iterations = 0_u32;
    let mut rxsqr = 0.0_f64;
    let mut rysqr = 0.0_f64;

    while iterations <= max_iterations && rxsqr + rysqr <= 4.0 {
        ry = (rx + rx) * ry + y0;
        rx = rxsqr - rysqr + x0;
        rysqr = ry * ry;
        rxsqr = rx * rx;
        iterations += 1;
    }

    iterations
}

fn is_in_main_cardioid_or_period2_bulb(x0: f64, y0: f64) -> bool {
    let y2 = y0 * y0;
    let x_minus_quarter = x0 - 0.25;
    let q = x_minus_quarter * x_minus_quarter + y2;
    if q * (q + x_minus_quarter) <= 0.25 * y2 {
        return true;
    }

    let x_plus_one = x0 + 1.0;
    x_plus_one * x_plus_one + y2 <= 0.0625
}

fn with_palette<R>(color_scheme: u32, max_iterations: u32, f: impl FnOnce(&[u8]) -> R) -> R {
    PALETTE_STATE.with(|state| {
        let mut state = state.borrow_mut();
        let required_len = (max_iterations as usize + 1) * 4;
        if state.color_scheme != color_scheme
            || state.max_iterations != max_iterations
            || state.data.len() != required_len
        {
            state.color_scheme = color_scheme;
            state.max_iterations = max_iterations;
            state.data.resize(required_len, 0);
            fill_palette(&mut state.data, color_scheme, max_iterations);
        }
        f(&state.data)
    })
}

fn fill_palette(data: &mut [u8], color_scheme: u32, max_iterations: u32) {
    for iteration in 0..=max_iterations {
        let [r, g, b] = palette_color(color_scheme, iteration, max_iterations);
        let index = iteration as usize * 4;
        data[index] = r;
        data[index + 1] = g;
        data[index + 2] = b;
        data[index + 3] = 255;
    }
}

fn palette_color(color_scheme: u32, iteration: u32, max_iterations: u32) -> [u8; 3] {
    if iteration >= max_iterations {
        return [0, 0, 0];
    }

    match color_scheme {
        1 => hsl_to_rgb((((120.0 * 2.0 * iteration as f64) / max_iterations as f64) % 120.0) + 180.0, 90.0, 50.0),
        2 => hsl_to_rgb(220.0, 90.0, ((75.0 * 2.0 * iteration as f64) / max_iterations as f64) % 75.0),
        _ => hsl_to_rgb(((360.0 * 2.0 * iteration as f64) / max_iterations as f64) % 360.0, 90.0, 50.0),
    }
}

fn hsl_to_rgb(h: f64, s: f64, l: f64) -> [u8; 3] {
    let hue = h.rem_euclid(360.0);
    let sat = s / 100.0;
    let light = l / 100.0;
    let chroma = (1.0 - (2.0 * light - 1.0).abs()) * sat;
    let segment = hue / 60.0;
    let x = chroma * (1.0 - ((segment % 2.0) - 1.0).abs());

    let (r1, g1, b1) = if segment < 1.0 {
        (chroma, x, 0.0)
    } else if segment < 2.0 {
        (x, chroma, 0.0)
    } else if segment < 3.0 {
        (0.0, chroma, x)
    } else if segment < 4.0 {
        (0.0, x, chroma)
    } else if segment < 5.0 {
        (x, 0.0, chroma)
    } else {
        (chroma, 0.0, x)
    };

    let m = light - chroma / 2.0;
    [
        ((r1 + m) * 255.0).round().clamp(0.0, 255.0) as u8,
        ((g1 + m) * 255.0).round().clamp(0.0, 255.0) as u8,
        ((b1 + m) * 255.0).round().clamp(0.0, 255.0) as u8,
    ]
}
