
export interface Point {
  x: number;
  y: number;
}

export interface FieldBoundary {
  id: string;
  name: string;
  farmName?: string;
  points: Point[];
  areaHectares: number;
}

export interface SavedFieldBoundary extends FieldBoundary {
  createdAt: number;
}

export interface ABLine {
  id: string;
  p1: Point;
  p2: Point;
  heading: number;
  spacing: number; // in meters
}

export interface SavedABLine extends ABLine {
  name: string;
  createdAt: number;
}

export interface MachineTelemetry {
  speed: number; // km/h
  targetSpeed: number; // km/h (target for simulation)
  rpm: number;
  fuelLevel: number; // percentage
  engineTemp: number; // Celsius
  gpsAccuracy: number; // cm
  oilPressure: number; // bar
  batteryVoltage: number; // V
  workRate: number; // hectares per hour
  areaCovered: number; // hectares
  activePathId?: string;
}

export interface PathOptimizationResult {
  efficiency: number;
  suggestedHeading: number;
  suggestedSpacing?: number;
  overlapPercentage: number;
  estimatedTimeHours: number;
  recommendations: string;
}
