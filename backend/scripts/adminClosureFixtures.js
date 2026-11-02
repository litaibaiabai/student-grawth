// Fictional integration data. Expectations deliberately do not call production
// projection, ranking, validation or report-model functions.
const importValues={
 conduct_politeness_other_star:3,conduct_integrity_other_star:2,conduct_kindness_other_star:3,conduct_communication_other_star:2,
 conduct_civility_other_star:3,conduct_responsibility_other_star:2,conduct_rules_other_star:3,conduct_cooperation_other_star:2,
 height_cm:142,weight_kg:34.5,vision_left:'5.0',vision_right:'4.9',jump_rope_1min:0,pe_academic_grade:'B',fitness_level_star:2,
 music_learning_teacher_star:3,music_regular_grade:'A',music_overall_grade:'B',fine_art_learning_teacher_star:2,fine_art_regular_grade:'B',fine_art_overall_grade:'A',
 labor_literacy_grade:'A',integrated_practice_literacy_grade:'B',local_course_literacy_grade:'A',
};
for(const [subject,grades] of Object.entries({moral:['A','B','A'],chinese:['A','A','A'],math:['B','A','B'],science:['B','B','B'],english:['A','B','B'],information_technology:['B','A','A']})){
 for(const [i,suffix] of ['interest_star','habit_star','method_star'].entries())importValues[`${subject}_${suffix}`]=[3,2,3][i];
 for(const [i,suffix] of ['regular_grade','final_grade','overall_grade'].entries())importValues[`${subject}_${suffix}`]=grades[i];
}
const selfValues={conduct_politeness_self_star:3,conduct_integrity_self_star:2,conduct_kindness_self_star:3,conduct_communication_self_star:2,conduct_civility_self_star:3,conduct_responsibility_self_star:2,conduct_rules_self_star:3,conduct_cooperation_self_star:2,fitness_self_star:2,music_learning_self_star:3,fine_art_learning_self_star:2};
const processTargets=['conduct_process_star','moral_process_star','chinese_process_star','math_process_star','science_process_star','english_process_star','information_technology_process_star','pe_process_star','fitness_process_star','music_process_star','fine_art_process_star','labor_process_star','integrated_practice_process_star','local_course_process_star'];
const teacherRows=[{username:'teacher_lin',real_name:'林知行',role:'teacher'},{username:'teacher_xu',real_name:'徐晨',role:'teacher'}];
const classRows=[1,2,3].map(classNo=>({grade:4,classNo,displayName:`四年级${classNo}班`,responsibleTeacherUsername:'teacher_lin'}));
const studentRows=[{username:'20260401',real_name:'林小禾',role:'student',grade:4,classNo:1}];
function expectedValues({listenCount=0,writeCount=0,chinesePoints=1}={}){
 return {...importValues,...selfValues,...Object.fromEntries(processTargets.map(k=>[k,k==='chinese_process_star'&&chinesePoints>0?3:1])),
 story_listen_star:listenCount>0?1:null,story_write_star:writeCount>0?1:null,story_tell_star:null,
 bmi:Math.round(34.5/(1.42*1.42)*100)/100,
 story_summary:{LISTEN:{value:listenCount,rank:listenCount>0?1:null},WRITE:{value:writeCount,rank:writeCount>0?1:null},TELL:{value:null,rank:null}},
 };
}
module.exports={importValues,selfValues,processTargets,teacherRows,classRows,studentRows,expectedValues};
