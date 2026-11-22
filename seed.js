// Startdaten: Übungen, zwei Pläne und Verlauf aus Armins Strava-Krafttrainings (Okt./Nov. 2026).
// "strava" = Übungsname wie Strava ihn anzeigt; wird später auf den exercise_type der Upload-API gemappt.
window.GT_SEED = function(){
  const ex = {
    cardio:  {name:'Cardio Aufwärmen',            type:'time',       strava:'Cardio',                       step:0,   rest:30},
    dl:      {name:'Kreuzheben (Langhantel)',      type:'weight',     strava:'Barbell Deadlift',             step:2.5, rest:90, cap:50, note:'LWS: Obergrenze beachten, nur sauber steigern.'},
    incl:    {name:'Schrägbankdrücken KH',         type:'weight',     strava:'Incline Dumbbell Bench Press', step:2.5, rest:60},
    lunge:   {name:'Ausfallschritt rückwärts KH',  type:'weight',     strava:'Dumbbell Reverse Lunge',       step:2.5, rest:60, note:'Wdh. = beide Beine zusammen.'},
    row:     {name:'Rudern brustgestützt',         type:'weight',     strava:'Chest-Supported Row',          step:2.5, rest:60},
    negpu:   {name:'Negativ-Klimmzüge',            type:'bodyweight', strava:'Negative Pull-Up',             step:2.5, rest:60},
    face:    {name:'Face Pull',                    type:'weight',     strava:'Face Pull',                    step:5,   rest:60},
    deadbug: {name:'Deadbug',                      type:'weight',     strava:'Deadbug',                      step:2.5, rest:45},
    plank:   {name:'Seitstütz',                    type:'time',       strava:'Side Plank',                   step:5,   rest:30, note:'Abwechselnd links und rechts.'},
    legpress:{name:'Beinpresse',                   type:'weight',     strava:'Machine Leg Press',            step:2.5, rest:60},
    calf:    {name:'Wadenheben stehend',           type:'weight',     strava:'Standing Calf Raise',          step:2.5, rest:45},
    u1:      {name:'Unbekannt 1 (ca. 10 kg)',      type:'weight',     strava:'',                             step:2.5, rest:60, note:'In Strava stand „Unknown“. Bitte unter Pläne umbenennen.'},
    u2:      {name:'Unbekannt 2 (ca. 30 kg)',      type:'weight',     strava:'',                             step:2.5, rest:60, note:'In Strava stand „Unknown“. Bitte unter Pläne umbenennen.'},
    oblcr:   {name:'Seitlicher Crunch',            type:'bodyweight', strava:'Oblique Crunch',               step:2.5, rest:45},
  };
  Object.keys(ex).forEach(k=>ex[k].id=k);

  const it=(e,sets,reps,secs)=>({ex:e,sets,reps:reps||0,secs:secs||0});
  const plans=[
    {id:'A',name:'Plan A · Kreuzheben',archived:false,items:[
      it('cardio',1,0,480), it('dl',3,10), it('incl',3,10), it('lunge',3,20), it('row',3,10),
      it('negpu',3,6), it('face',3,10), it('deadbug',3,20), it('plank',6,0,40)]},
    {id:'B',name:'Plan B · Beinpresse',archived:false,items:[
      it('cardio',1,0,480), it('incl',3,10), it('legpress',3,15), it('u1',3,10), it('u2',3,10),
      it('calf',3,15), it('plank',3,0,60)]},
  ];

  // Verlauf: [w, r] bzw. Sekunden bei Zeitübungen
  const W=(e,...s)=>({ex:e,sets:s.map(x=>Array.isArray(x)?{w:x[0],r:x[1]}:{s:x})});
  const day=(iso,mins,plan,exs)=>{const s=new Date(iso).getTime();return {id:'strava-'+iso.slice(0,10),plan,start:s,end:s+mins*60000,source:'strava',ex:exs}};
  const history=[
    day('2026-10-28T18:44:35',50,'B',[W('cardio',374),W('incl',[30,6],[30,6],[30,6]),W('legpress',[74,20],[74,20],[74,20]),W('u1',[8,10],[8,10]),W('u2',[30,10],[30,10],[30,11]),W('calf',[10,10],[10,10],[10,10]),W('plank',60,54,43)]),
    day('2026-10-31T09:08:31',61,'A',[W('cardio',434),W('dl',[30,11],[40,10],[40,10]),W('incl',[20,10],[20,10],[20,10]),W('negpu',[0,5],[0,5],[0,5]),W('plank',53,39,39,35,35,25)]),
    day('2026-11-03T18:29:18',51,'B',[W('cardio',409),W('incl',[20,10],[20,10],[20,10]),W('legpress',[60,15],[78,15],[78,15]),W('u1',[10,10],[10,10],[10,10]),W('u2',[30,10],[35,8],[30,10]),W('calf',[10,20],[10,20],[10,20]),W('plank',60,60,55)]),
    day('2026-11-15T18:13:38',101,'A',[W('cardio',546),W('dl',[40,10],[50,10],[50,14]),W('incl',[20,11],[22.5,10],[22.5,9]),W('lunge',[10,21],[12.5,21],[12.5,21]),W('row',[30,12],[35,10],[35,9]),W('face',[15,8],[20,10],[25,10]),W('deadbug',[10,20],[10,20],[10,20]),W('plank',54,44,34,37,36,36)]),
    day('2026-11-19T18:21:39',60,'A',[W('cardio',552),W('dl',[40,10],[40,11],[40,11]),W('incl',[20,12],[20,12],[20,10]),W('lunge',[10,21],[15,20],[15,20]),W('row',[30,13],[35,10],[35,9]),W('negpu',[0,6],[0,6],[0,5]),W('oblcr',[0,10],[0,10],[0,10])]),
  ];
  return {v:1, exercises:ex, plans, history, active:null, settings:{sound:true, volume:0.8}};
};
