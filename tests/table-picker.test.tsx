// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {TablePicker} from '../src/web/components/TablePicker';
afterEach(cleanup);
const tables=[{id:'a',displayName:'Định mức vật tư',logicalName:'ph_material_rate'},{id:'b',displayName:'Đơn hàng',logicalName:'ph_order'}];
it('filters inside the dropdown by unaccented display name or logical name and chooses a single table',()=>{
 const change=vi.fn();render(<TablePicker tables={tables as never} value="" onChange={change}/>);
 fireEvent.click(screen.getByRole('combobox',{name:'Bảng cần chuyển column'}));fireEvent.change(screen.getByRole('searchbox',{name:'Lọc bảng'}),{target:{value:'dinh muc'}});expect(screen.getAllByRole('option')).toHaveLength(1);expect(screen.getByRole('option').textContent).toContain('Định mức vật tư');
 fireEvent.change(screen.getByRole('searchbox',{name:'Lọc bảng'}),{target:{value:'ph_order'}});fireEvent.keyDown(screen.getByRole('searchbox',{name:'Lọc bảng'}),{key:'Enter'});expect(change).toHaveBeenCalledWith('b');expect(screen.queryByRole('listbox')).toBeNull();
});
it('shows empty search results and closes without losing the selection',()=>{
 render(<TablePicker tables={tables as never} value="a" onChange={()=>{}}/>);fireEvent.click(screen.getByRole('combobox',{name:'Bảng cần chuyển column'}));fireEvent.change(screen.getByRole('searchbox',{name:'Lọc bảng'}),{target:{value:'not-found'}});expect(screen.getByText('Không tìm thấy bảng')).toBeTruthy();fireEvent.keyDown(screen.getByRole('searchbox',{name:'Lọc bảng'}),{key:'Escape'});expect(screen.getByRole('combobox').textContent).toContain('Định mức vật tư');
});
