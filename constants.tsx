
import React from 'react';

export const DISCLAIMER_TEXT = "This Clarity Report is for decision-support and educational purposes only. It is not a diagnosis, repair instruction, or a substitute for professional mechanical inspection. Clarity Desk does not perform vehicle scans or sell parts.";

export const VEHICLE_MAKES = [
  "Toyota", "Lexus", "Honda", "Tesla", "Nissan", "Hyundai", "Kia", "Ford", "Chevrolet", "BMW", "Mercedes-Benz", "Audi", "BYD", "Other"
];

export const VEHICLE_MODELS: Record<string, string[]> = {
  "Toyota": ["Prius", "Prius Prime", "RAV4 Hybrid", "RAV4 Prime", "Camry Hybrid", "Corolla Hybrid", "bZ4X", "Mirai", "Sienna", "Highlander Hybrid", "Venza"],
  "Lexus": ["ES 300h", "NX 350h", "NX 450h+", "RX 350h", "RX 450h+", "RX 500h", "RZ 450e", "UX 250h", "LS 500h", "LC 500h"],
  "Honda": ["Accord Hybrid", "CR-V Hybrid", "Insight", "Clarity PHEV", "Prologue", "Civic Hybrid"],
  "Tesla": ["Model 3", "Model Y", "Model S", "Model X", "Cybertruck"],
  "Nissan": ["LEAF", "Ariya"],
  "Hyundai": ["Ioniq 5", "Ioniq 6", "Kona Electric", "Tucson Hybrid", "Santa Fe Hybrid", "Nexo"],
  "Kia": ["EV6", "EV9", "Niro EV", "Niro PHEV", "Sportage Hybrid", "Sorento Hybrid"],
  "Ford": ["Mustang Mach-E", "F-150 Lightning", "Maverick Hybrid", "Escape PHEV"],
  "Chevrolet": ["Bolt EV", "Bolt EUV", "Silverado EV", "Blazer EV", "Volt"],
  "BMW": ["i3", "i4", "i5", "i7", "iX", "330e", "X5 xDrive50e"],
  "Mercedes-Benz": ["EQS", "EQE", "EQB", "GLC 350e", "S 580e"],
  "Audi": ["Q4 e-tron", "Q8 e-tron", "e-tron GT", "Q5 TFSI e"],
  "BYD": ["Atto 3", "Han", "Seal", "Dolphin", "Tang"],
  "Other": []
};

export const APP_MESSAGES = [
  "Consulting the engineering archives...",
  "Matching vehicle architecture with known failure modes...",
  "Filtering manufacturer recall data...",
  "Translating complex signals into clarity...",
  "Building your Clarity Report..."
];
