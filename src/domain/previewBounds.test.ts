import { describe, expect, it } from "vitest";
import { previewBounds } from "./previewBounds";
const shape = { id:"1",slideId:"1",left:400,top:250,width:80,height:40,rotation:0,adjustment:0.2,slideWidth:960,slideHeight:540 };
describe("preview framing",()=>{
  it("keeps small glass prominent with surrounding background",()=>{ const b=previewBounds(shape); expect(b.width).toBeLessThan(160); expect(b.left).toBeLessThan(shape.left); expect(b.left+b.width).toBeGreaterThan(shape.left+shape.width); });
  it("clamps the crop to slide edges",()=>{ const b=previewBounds({...shape,left:0,top:0}); expect(b.left).toBe(0); expect(b.top).toBe(0); });
  it("includes rotated glass",()=>{ const b=previewBounds({...shape,rotation:90}); expect(b.height).toBeGreaterThan(shape.width); });
});
