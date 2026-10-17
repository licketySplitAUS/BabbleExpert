// Editorial layer: selected footage of the real app, with normalised focus boxes.
export const TOUR_VERSION = 2;
const clue=[.015,.23,.27,.54], game=[.38,.17,.32,.49], add=[.37,.65,.24,.23];
const menu=[.45,.025,.21,.47], resource=[.92,.06,.08,.87], popup=[.60,.42,.29,.38];
const beat=(clip,caption,duration=9,extra={})=>({clip,caption,duration,...extra});
export const chapters=[
 {id:'fresh',icon:'01',title:'A fresh grid',subtitle:'Your daily word ritual.',beats:[
  beat('fresh','Every day brings a different grid. Your words-left count shows how much there is still to discover.',9,{focus:game,badge:'A new puzzle each day'}),
  beat('fresh','Already signed in? Start playing. Refresh Babble loads the game again; Reload Clues refreshes your chosen clue page.',9,{focus:[0,0,.32,.075],badge:'Your daily starting point',pointer:[.052,.042]}),
  beat('fresh','Self Serve checks the grid automatically. Grab Grid lets you check it yourself when you need to.',9,{focus:clue,badge:'Keep both pages on the same grid',pointer:[.038,.31]})
 ]},
 {id:'enter',icon:'02',title:'Find your first words',subtitle:'Type it. Trace it. Make it yours.',beats:[
  beat('babble-type','Type a word in Babble’s own Add Word box. The matching letters light up on the grid as you enter it.',11,{focus:game,from:0,to:9,badge:'Follow your letters',pointer:[.50,.56]}),
  beat('babble-type','Press Enter or click Add. A confirmed word joins My Word List and is marked in your clues automatically.',8,{focus:game,from:9,badge:'One entry. Both pages.',pointer:[.53,.56]}),
  beat('babble-tiles','Prefer clicking? Click adjacent letters on Babble’s grid to build the word in its entry box, then submit it.',12,{focus:game,badge:'Click letters · build a word'}),
  beat('babble-tiles','Typing and grid clicks use the same Babble entry box. Check the result message after each submission.',8,{focus:game,from:10,badge:'Your word, ready to submit'})
 ]},
 {id:'add',icon:'03',title:'Meet Lickety Add',subtitle:'Your always-nearby entry box.',beats:[
  beat('add','Open Lickety Add for a floating word-entry box. Type a word and press Enter to send it to Babble and Clues.',11,{focus:add,badge:'A little less travelling'}),
  beat('add','Green means Babble confirmed the word. The result text explains what happened, so you can keep your attention on the puzzle.',9,{focus:add,from:8,badge:'Confirmed by Babble'}),
  beat('duplicate','An already-entered word gets an amber response. Your existing find stays marked; you do not lose a word.',9,{focus:add,badge:'Already found · keep exploring'}),
  beat('rejected','A rejected word gets red. Read the message, adjust your word, and have another go.',9,{focus:add,badge:'Clear feedback for every attempt'})
 ]},
 {id:'clues',icon:'04',title:'A nudge when you’re stuck',subtitle:'Let the clues narrow the search.',beats:[
  beat('selfserve-type','Clue labels give the starting letters, length and points. You can also type a word in Self Serve’s Add Word box.',12,{focus:clue,badge:'Starting letters · length · points'}),
  beat('selfserve-tiles','The Self Serve grid is clickable too. Build your word with its letters, then use Add Word to submit it.',12,{focus:[.005,.27,.29,.31],badge:'Click here · see the path in Babble'}),
  beat('lickety-type','Lickety’s original clues offer another entry box. Here, adding TUNS marks the clue and automatically adds it to Babble.',12,{focus:[.01,.28,.61,.35],badge:'Type in whichever pane suits you'}),
  beat('lickety-tiles','You can click the letters on Lickety’s original clue grid as well. Expert highlights the matching path on Babble.',12,{focus:[.005,.28,.61,.32],badge:'The same letters, connected'})
 ]},
 {id:'resources',icon:'05',title:'Keep your train of thought',subtitle:'Same beginning. Another length.',beats:[
  beat('resource-open','Open a letter-word list from Resources. Choose the length you want to explore beside the puzzle.',11,{focus:[.40,.02,.60,.91],badge:'A little help, right beside you'}),
  beat('clue-lookup','With a list open, click an unfinished clue. Expert selects its length and centres the first candidate between solved alphabetical neighbours.',10,{focus:[.005,.32,.995,.40],badge:'The clue narrows your browsing'}),
  beat('resource-click','Click a resource word to try it. Babble decides whether it belongs in today’s puzzle; accepted words sync to Clues.',11,{focus:[.35,.29,.65,.40],badge:'Browse · click · check the result'}),
  beat('resource-type','Type a word or starting letters in the resource search box. The match centres in the list; keyboard entry gets priority over mouse movement.',12,{focus:[.755,.08,.245,.71],badge:'Type to find your place'}),
  beat('resource-plus','Use + or − beside Hide to change length. Your last clicked word anchors the search: ENSURE keeps you near ENSUR… in seven letters.',12,{focus:[.755,.055,.245,.73],badge:'Same beginning · one letter longer'}),
  beat('resource-minus','Use − to go shorter again. The mouse wheel and middle button scroll normally; moving near an edge scrolls gently.',10,{focus:resource,badge:'Keep your place while you explore'})
 ]},
 {id:'sources',icon:'06',title:'Clues that stay together',subtitle:'Change your view, keep your finds.',beats:[
  beat('off','Choose Off in Self Serve to see only unfinished clues. When a word syncs from Babble, your Off filter stays selected.',9,{focus:clue,badge:'Less clutter. More possibility.',pointer:[.084,.39]}),
  beat('sources','Switch between Self Serve and Lickety’s Clues from this menu. Expert brings across your accepted Babble words when the grids match.',12,{focus:[0,0,.37,.69],badge:'Your finds travel with you',pointer:[.146,.042]}),
  beat('sources','The manual transfer buttons are there whenever you want a sync on demand. Check that both pages show the same grid first.',9,{focus:[.18,0,.20,.075],from:9,badge:'Matching grids · ready to sync'})
 ]},
 {id:'chat',icon:'07',title:'Say hello along the way',subtitle:'The community is part of the puzzle.',beats:[
  beat('chat','Lickety Add can send chat too. With No Chat off, a message containing spaces goes to chat when you press Enter.',10,{focus:add,badge:'A small hello goes a long way'}),
  beat('chat','For a single-word chat message, use Ctrl+Enter. On Mac, use Command+Enter. This forces chat even with No Chat enabled.',10,{focus:add,from:8,badge:'Ctrl + Enter · Mac ⌘ + Enter'}),
  beat('chat','Check your message before sending. This recording leaves its example as a draft, so the live chat is not interrupted.',9,{focus:add,from:8,badge:'Ready when you are'})
 ]},
 {id:'layout',icon:'08',title:'Make the space yours',subtitle:'A comfortable setup makes a difference.',beats:[
  beat('divider','Drag the divider to give Clues more room. Arrange the panes so you can comfortably see the information you use most.',11,{focus:[.25,.06,.25,.87],badge:'Make room for your way of playing'}),
  beat('move-add','Drag Lickety Add by its title bar to put it where it feels comfortable. Resize the box to suit your screen.',10,{focus:[.35,.64,.43,.24],badge:'Keep your entry box close'}),
  beat('create-option','Options also holds the theme, Switch Sides, grid highlighting and Lickety Add settings. Make Expert comfortable for you.',10,{focus:menu,from:3.5,to:7.2,badge:'A familiar workspace, arranged your way'})
 ]},
 {id:'play',icon:'09',title:'Take a little breather',subtitle:'A little delight between discoveries.',beats:[
  beat('fun-open','Choose Fun Word Play from Options. It opens beside your puzzle, ready to bring entered words to life.',10,{focus:[.71,.06,.29,.87],badge:'A little colour while you play'}),
  beat('fun','Submit a word and watch it appear in Fun Word Play. You can carry on playing while the visual sits alongside you.',12,{focus:[.71,.06,.29,.87],badge:'Your words, with a little personality'}),
  beat('chill','Prefer something gentler? Choose Chill Vibes for a flowing backdrop. Hide closes the resource pane whenever you want the room back.',12,{focus:[.71,.06,.29,.87],badge:'A calmer rhythm'})
 ]},
 {id:'share',icon:'10',title:'Turn a find into a clue',subtitle:'Pass a little discovery along.',beats:[
  beat('create-option','Turn on “Create Clues – click on your found word” in Options. It starts off by default.',11,{focus:menu,from:3.5,holdAt:5,holdFor:4,badge:'Turn it on when you want it',pointer:[.56,.32]}),
  beat('create','Click a found word in My Word List. A small editor opens with the clue label and a definition to help you write a hint.',11,{focus:popup,badge:'A find worth sharing'}),
  beat('retry','Not the clue you wanted? Click Try again to see another available definition.',10,{focus:popup,badge:'Another angle on the same word'}),
  beat('edit-clue','Edit the wording to make your clue brief and useful. Send to Babble Chat shares the clue label and your edited hint.',10,{focus:popup,badge:'Refine it before you share'}),
  beat('clue-source-popup','Found words in the clue pages work too. Here is the same real clue editor opened from Lickety’s clues. Close dismisses it without sending.',12,{focus:[.02,.59,.30,.39],badge:'A useful clue, wherever you found it'}),
  beat('fresh','Replay this tour from Help or Options whenever you like. Choose any chapter to start playing it immediately. Enjoy your next word.',10,{badge:'Your next word starts here.'})
 ]}
];
export const duration=chapters.reduce((sum,chapter)=>sum+chapter.beats.reduce((n,step)=>n+step.duration,0),0);
