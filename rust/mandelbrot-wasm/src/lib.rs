#[no_mangle]
pub extern "C" fn alloc_u32(len: usize) -> *mut u32 {
    let mut buffer = Vec::<u32>::with_capacity(len);
    let ptr = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    ptr
}

#[no_mangle]
pub extern "C" fn dealloc_u32(ptr: *mut u32, len: usize) {
    unsafe {
        drop(Vec::from_raw_parts(ptr, 0, len));
    }
}

#[no_mangle]
pub extern "C" fn render_line(
    y: u32,
    width: u32,
    offsetx: f64,
    offsety: f64,
    panx: f64,
    pany: f64,
    zoom: f64,
    max_iterations: u32,
    out_ptr: *mut u32,
) {
    let width_usize = width as usize;
    let y0 = (y as f64 + offsety + pany) / zoom;
    let out = unsafe { std::slice::from_raw_parts_mut(out_ptr, width_usize) };

    for x in 0..width_usize {
        let x0 = (x as f64 + offsetx + panx) / zoom;

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

        out[x] = iterations;
    }
}
