'use client';

import { useState } from 'react';
import { useBranchStore } from '@/store/branchStore';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { Building2, Plus, Edit2, Trash2, MapPin, Navigation, Crosshair, Users } from 'lucide-react';
import { useEmployeeStore } from '@/store/employeeStore';
import type { Branch } from '@/lib/types';

export default function BranchManagementPage() {
  const branchStore = useBranchStore();
  const employeeStore = useEmployeeStore();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    latitude: 13.7563,
    longitude: 100.5018,
    geofence_radius_meters: 100,
  });

  const handleOpenModal = (branch?: Branch) => {
    if (branch) {
      setEditingBranch(branch);
      setFormData({
        name: branch.name,
        address: branch.address,
        latitude: branch.latitude,
        longitude: branch.longitude,
        geofence_radius_meters: branch.geofence_radius_meters,
      });
    } else {
      setEditingBranch(null);
      setFormData({
        name: '',
        address: '',
        latitude: 13.7563,
        longitude: 100.5018,
        geofence_radius_meters: 100,
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (editingBranch) {
      await branchStore.updateBranch(editingBranch.id, formData);
    } else {
      const newBranch = {
        ...formData,
      };
      await branchStore.addBranch(newBranch);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">จัดการสาขา</h1>
          <p className="text-slate-500 text-sm mt-1">ตั้งค่าสถานที่ทำงานและรัศมีการตรวจสอบ GPS</p>
        </div>
        <Button onClick={() => handleOpenModal()} icon={<Plus className="w-4 h-4" />}>
          เพิ่มสาขาใหม่
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {branchStore.branches.map(branch => {
          const empCount = employeeStore.getUsersByBranch(branch.id).length;
          return (
            <Card key={branch.id} className="flex flex-col h-full" statusColor="blue">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => handleOpenModal(branch)}
                    className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    onClick={() => branchStore.deleteBranch(branch.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <h3 className="font-bold text-slate-900 mb-1">{branch.name}</h3>
              <p className="text-xs text-slate-500 mb-4 h-8 line-clamp-2">{branch.address}</p>
              
              <div className="space-y-3 pt-4 border-t border-slate-100 mt-auto">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> พนักงาน</span>
                  <span className="font-semibold text-slate-900">{empCount} คน</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 flex items-center gap-1.5"><Navigation className="w-3.5 h-3.5" /> พิกัด</span>
                  <span className="font-medium text-slate-700">{branch.latitude.toFixed(4)}, {branch.longitude.toFixed(4)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 flex items-center gap-1.5"><Crosshair className="w-3.5 h-3.5" /> รัศมีอนุญาต</span>
                  <span className="font-bold text-emerald-600">{branch.geofence_radius_meters} เมตร</span>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingBranch ? 'แก้ไขข้อมูลสาขา' : 'เพิ่มสาขาใหม่'}
      >
        <div className="space-y-4">
          <Input 
            label="ชื่อสาขา"
            placeholder="เช่น สำนักงานใหญ่ สุขุมวิท"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
          />
          <Input 
            label="ที่อยู่"
            placeholder="กรอกที่อยู่สาขา"
            value={formData.address}
            onChange={(e) => setFormData({...formData, address: e.target.value})}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="ละติจูด (Latitude)"
              type="number"
              step="0.000001"
              value={formData.latitude}
              onChange={(e) => setFormData({...formData, latitude: parseFloat(e.target.value)})}
            />
            <Input 
              label="ลองจิจูด (Longitude)"
              type="number"
              step="0.000001"
              value={formData.longitude}
              onChange={(e) => setFormData({...formData, longitude: parseFloat(e.target.value)})}
            />
          </div>
          <Input 
            label="รัศมีตรวจสอบพิกัด (Geofence Radius - เมตร)"
            type="number"
            icon={<MapPin className="w-4 h-4" />}
            value={formData.geofence_radius_meters}
            onChange={(e) => setFormData({...formData, geofence_radius_meters: parseInt(e.target.value)})}
          />
          <div className="bg-slate-50 p-3 rounded-lg flex items-start gap-2">
            <Navigation className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-500 leading-relaxed">
              พนักงานจะต้องอยู่ภายในรัศมี {formData.geofence_radius_meters} เมตรรอบจุดที่กำหนด เพื่อทำการเช็กอินผ่านแอปพลิเคชันได้
            </p>
          </div>
          
          <div className="flex gap-3 pt-4">
            <Button variant="secondary" fullWidth onClick={() => setIsModalOpen(false)}>ยกเลิก</Button>
            <Button fullWidth onClick={handleSave}>บันทึกข้อมูลสาขา</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
