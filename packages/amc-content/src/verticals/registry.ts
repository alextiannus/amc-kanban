import type { IndustryVertical } from '../types.ts'

export interface VerticalSpec {
  vertical: IndustryVertical
  displayName: string
  skillVersion: string
  customerIntents: string[]
  proofSignals: string[]
  complianceNotes: string[]
}

export const verticalSpecs: Record<IndustryVertical, VerticalSpec> = {
  food_beverage: {
    vertical: 'food_beverage',
    displayName: 'Food and Beverage',
    skillVersion: 'food_beverage@1.0.0',
    customerIntents: ['discover_place', 'choose_meal', 'book_table', 'redeem_offer'],
    proofSignals: ['location', 'menu_item', 'customer_review', 'opening_hours'],
    complianceNotes: ['Do not claim halal, organic, or health benefits unless provided by brand knowledge.'],
  },
  beauty_wellness: {
    vertical: 'beauty_wellness',
    displayName: 'Beauty and Wellness',
    skillVersion: 'beauty_wellness@1.0.0',
    customerIntents: ['look_better', 'relax', 'prepare_for_event', 'try_package'],
    proofSignals: ['before_after', 'service_process', 'hygiene', 'staff_expertise'],
    complianceNotes: ['Avoid unrealistic transformation claims or medical claims.'],
  },
  fitness_pilates: {
    vertical: 'fitness_pilates',
    displayName: 'Fitness and Pilates',
    skillVersion: 'fitness_pilates@1.0.0',
    customerIntents: ['trial_class', 'improve_posture', 'lose_weight', 'build_routine'],
    proofSignals: ['coach_credential', 'class_format', 'member_story', 'trial_offer'],
    complianceNotes: ['Avoid guaranteed body transformation or medical outcome claims.'],
  },
  home_renovation: {
    vertical: 'home_renovation',
    displayName: 'Home Renovation and Services',
    skillVersion: 'home_renovation@1.0.0',
    customerIntents: ['fix_problem', 'compare_quote', 'upgrade_space', 'book_visit'],
    proofSignals: ['before_after', 'materials', 'transparent_pricing', 'workmanship'],
    complianceNotes: ['Avoid false lowest-price claims or unverified warranty promises.'],
  },
  pet_services: {
    vertical: 'pet_services',
    displayName: 'Pet Services',
    skillVersion: 'pet_services@1.0.0',
    customerIntents: ['groom_pet', 'board_pet', 'train_pet', 'pet_care'],
    proofSignals: ['safety', 'clean_environment', 'staff_care', 'pet_friendly'],
    complianceNotes: ['Avoid veterinary medical claims unless explicitly provided.'],
  },
  education_training: {
    vertical: 'education_training',
    displayName: 'Education and Training',
    skillVersion: 'education_training@1.0.0',
    customerIntents: ['trial_lesson', 'improve_skill', 'prepare_exam', 'enroll_course'],
    proofSignals: ['teacher_credential', 'curriculum', 'student_progress', 'trial_class'],
    complianceNotes: ['Avoid guaranteed grade or admission outcome claims.'],
  },
  healthcare_clinic: {
    vertical: 'healthcare_clinic',
    displayName: 'Healthcare and Clinic',
    skillVersion: 'healthcare_clinic@1.0.0',
    customerIntents: ['consult', 'book_appointment', 'understand_service', 'preventive_care'],
    proofSignals: ['licensed_staff', 'process', 'safety', 'appointment_details'],
    complianceNotes: ['Avoid diagnosis, cure, guaranteed results, or fear-based claims.'],
  },
  retail_specialty: {
    vertical: 'retail_specialty',
    displayName: 'Specialty Retail',
    skillVersion: 'retail_specialty@1.0.0',
    customerIntents: ['buy_gift', 'discover_product', 'seasonal_purchase', 'local_delivery'],
    proofSignals: ['product_detail', 'limited_edition', 'use_case', 'delivery_option'],
    complianceNotes: ['Avoid false scarcity or unsupported product claims.'],
  },
  events_entertainment: {
    vertical: 'events_entertainment',
    displayName: 'Events and Entertainment',
    skillVersion: 'events_entertainment@1.0.0',
    customerIntents: ['weekend_plan', 'group_booking', 'family_activity', 'join_event'],
    proofSignals: ['date_time', 'capacity', 'venue', 'price'],
    complianceNotes: ['Make event terms and booking constraints clear.'],
  },
  professional_services: {
    vertical: 'professional_services',
    displayName: 'Professional Services',
    skillVersion: 'professional_services@1.0.0',
    customerIntents: ['consult', 'compare_provider', 'solve_business_problem', 'request_quote'],
    proofSignals: ['case_study', 'credential', 'process', 'consultation_offer'],
    complianceNotes: ['Avoid legal, financial, or professional guarantees unless approved.'],
  },
  general_local_service: {
    vertical: 'general_local_service',
    displayName: 'General Local Service',
    skillVersion: 'general_local_service@1.0.0',
    customerIntents: ['discover', 'understand_offer', 'visit_or_contact', 'book_service'],
    proofSignals: ['location', 'service_detail', 'review', 'clear_cta'],
    complianceNotes: ['Use conservative local-service claims until a specific vertical is known.'],
  },
}

export function getVerticalSpec(vertical: IndustryVertical): VerticalSpec {
  return verticalSpecs[vertical] ?? verticalSpecs.general_local_service
}

export function listVerticalSpecs(): VerticalSpec[] {
  return Object.values(verticalSpecs)
}
