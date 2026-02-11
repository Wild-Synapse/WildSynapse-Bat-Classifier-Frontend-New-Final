export type SpeciesDetected = {
  species: string;
  confidence: number;
};

export type CallParameters = {
  start_frequency: number;
  end_frequency: number;
  peak_frequency: number;
  bandwidth: number;
  intensity: number;
  pulse_duration: number;
  total_length: number;
  shape: string;
};

export type AnalysisResult = {
  file_id: string;
  original_filename: string;
  timestamp: number;
  duration: number;
  sample_rate: number;
  spectrogram_url: string;
  species_image_url?: string;
  audio_url?: string;
  species_detected: SpeciesDetected[];
  call_parameters: CallParameters;
  threshold?: number;
  max_threshold?: number;
};

export interface HealthStatus {
  services: Record<string, string>;
}

export interface Statistics {
  total_analyses: number;
  total_duration_hours: number;
  unique_species_detected: number;
  storage_type: string;
  top_species: { species: string; count: number }[];
}