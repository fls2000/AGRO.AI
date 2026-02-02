
import React from 'react';
import { MachineTelemetry } from '../types';
import { Gauge, Zap, Navigation, Fuel, Thermometer, Droplets, Battery, Activity } from 'lucide-react';

interface Props {
  data: MachineTelemetry;
}

const TelemetryItem: React.FC<{ 
  icon: React.ReactNode; 
  label: string; 
  value: string | number; 
  unit?: string; 
  colorClass: string;
  status?: 'normal' | 'warning' | 'critical';
}> = ({ icon, label, value, unit, colorClass, status = 'normal' }) => {
  const statusColors = {
    normal: 'border-zinc-800',
    warning: 'border-yellow-600/50 bg-yellow-900/10',
    critical: 'border-red-600 bg-red-900 animate-pulse'
  };

  const textClass = status === 'critical' ? 'text-white' : colorClass;

  return (
    <div className={`flex flex-col p-3 bg-zinc-900/80 rounded-lg border ${statusColors[status]} transition-all duration-300`}>
      <div className={`flex items-center gap-2 mb-1 ${status === 'critical' ? 'text-white' : 'text-zinc-500'}`}>
        <span className={status === 'critical' ? 'text-white' : colorClass}>{icon}</span>
        <span className="text-[10px] uppercase font-bold tracking-tighter whitespace-nowrap">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-mono font-bold tracking-tight ${status === 'critical' ? 'text-white' : ''}`}>{value}</span>
        {unit && <span className={`text-[10px] font-medium uppercase ${status === 'critical' ? 'text-red-200' : 'text-zinc-500'}`}>{unit}</span>}
      </div>
    </div>
  );
};

const TelemetryOverlay: React.FC<Props> = ({ data }) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-black/60 backdrop-blur-xl rounded-xl border border-white/5 shadow-2xl">
      <TelemetryItem 
        icon={<Gauge size={14} />} 
        label="Velocidade" 
        value={data.speed.toFixed(1)} 
        unit="km/h" 
        colorClass="text-green-400" 
      />
      <TelemetryItem 
        icon={<Zap size={14} />} 
        label="Rotação" 
        value={Math.round(data.rpm)} 
        unit="rpm" 
        colorClass="text-yellow-400" 
        status={data.rpm > 2200 ? 'warning' : 'normal'}
      />
      <TelemetryItem 
        icon={<Navigation size={14} />} 
        label="Precisão" 
        value={data.gpsAccuracy.toFixed(1)} 
        unit="cm" 
        colorClass="text-blue-400" 
        status={data.gpsAccuracy > 10 ? 'warning' : 'normal'}
      />
      <TelemetryItem 
        icon={<Fuel size={14} />} 
        label="Diesel" 
        value={data.fuelLevel.toFixed(0)} 
        unit="%" 
        colorClass="text-red-400" 
        status={data.fuelLevel < 15 ? 'critical' : data.fuelLevel < 25 ? 'warning' : 'normal'}
      />
      <TelemetryItem 
        icon={<Thermometer size={14} />} 
        label="Temp Água" 
        value={data.engineTemp.toFixed(1)} 
        unit="°C" 
        colorClass="text-orange-400" 
        status={data.engineTemp > 95 ? 'critical' : data.engineTemp > 90 ? 'warning' : 'normal'}
      />
      <TelemetryItem 
        icon={<Droplets size={14} />} 
        label="Pressão Óleo" 
        value={data.oilPressure.toFixed(1)} 
        unit="bar" 
        colorClass="text-cyan-400" 
      />
      <TelemetryItem 
        icon={<Battery size={14} />} 
        label="Bateria" 
        value={data.batteryVoltage.toFixed(1)} 
        unit="V" 
        colorClass="text-emerald-400" 
      />
      <TelemetryItem 
        icon={<Activity size={14} />} 
        label="Rendimento" 
        value={data.workRate.toFixed(1)} 
        unit="ha/h" 
        colorClass="text-purple-400" 
      />
      
      {/* Footer Area with Summary Info */}
      <div className="col-span-2 lg:col-span-4 mt-1 pt-3 border-t border-zinc-800 flex justify-between items-center px-1">
        <div className="flex gap-4">
          <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
            Área Coberta: <span className="text-zinc-200 font-mono">{data.areaCovered.toFixed(2)} HA</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
          <span className="text-[9px] font-bold text-green-500 uppercase tracking-tighter">Live Stream Active</span>
        </div>
      </div>
    </div>
  );
};

export default TelemetryOverlay;
