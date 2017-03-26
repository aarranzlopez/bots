//Required packages
var restify = require("restify");
var builder = require("botbuilder");
var request = require("request");
var promise = require("promise");

//"Global" variables
var LAUREATES = "laureates";
var COUNTRYAWARDS = 'awards';
var DICTIONARY = {'ä':'a', 'ë':'e', 'ï':'i','ö':'o',
                 'ü':'u','å':'o', 'ø':'o'};


//Connector definition
//A ChatConnector will allow us to make our bot available
//accross various communication channels.
var connector = new builder.ChatConnector(
    {
        appId: process.env.MICROSOFT_APP_ID,
        appPassword: process.env.MICROSOFT_APP_PASSWORD
    }
);

//Bot definition
var bot = new builder.UniversalBot(connector);

//Create LUIS Dialog connected to our published LUIS model. 
var model = "https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/e20d7a85-6bb0-410a-b3d3-cc0d3257f739?subscription-key=2c9cff19dab246eda0eacc90542fc9c7&verbose=true&q=";
var recognizer = new builder.LuisRecognizer(model);
var intent = new builder.IntentDialog({ recognizers: [recognizer] });



bot.dialog("/", intent.matches('getLaureate','/getLaureate')
                      .matches('getAward','/getAward')
                      .matches('getHelp','/getHelp')
                      .onDefault(builder.DialogAction.send("I didn't understand you...type 'help' if you want to see some query examples.")));

bot.dialog('/getLaureate', [

    function (session, args, next) {
        console.log("LAUREATE");
        console.log(args.entities);
        var category = builder.EntityRecognizer.findEntity(args.entities, 'category');
        var year = builder.EntityRecognizer.findEntity(args.entities, 'year');
        if (category && year) {
            session.dialogData.category = category.entity;
            session.dialogData.year = year.entity;
            var url = "http://api.nobelprize.org/v1/prize.json?category=" + category.entity + "&year=" + year.entity;
            var res = getJSONresult(url, session, LAUREATES);
            //next();
        } else {
            session.endDialog("I need to know the prize's category and its year. Please try again!");
        }

    },

    /*function (session, results){
        console.log("Construimos toda la puta mierda esa");
        var url = "http://api.nobelprize.org/v1/prize.json?category="+session.dialogData.category+"&year="+session.dialogData.year;
        var res = getJSONresult(url, session, LAUREATES);
        
    }*/
]);

bot.dialog('/getAward', [

    function (session, args, next) {
        var bornCountry = builder.EntityRecognizer.findEntity(args.entities, 'bornCountry');
        
        if (bornCountry) {
            var url = "http://api.nobelprize.org/v1/laureate.json?";
            
            if(bornCountry.entity.length == 2){
                url += "bornCountryCode=" + bornCountry.entity;    
            }else{
                url += "bornCountry=" + bornCountry.entity;    
            }            
            
            session.dialogData.bornCountry = bornCountry.entity;
            getJSONresult(url, session, COUNTRYAWARDS, next);
        } else {
            session.endDialog("I need to know the Country. Please try again!");
        }
    },

    function (session, results) {
        builder.Prompts.number(session, "How many do you want to see?");
    },

    function (session, results) {
        var nobels2show = 0;
        var cronSort = true;
        var sortedNobels = null;
        if(results.response < 0){
            var cronSort = false;
        }
        var nobelsRequested = parseInt(Math.abs(results.response));
        if(nobelsRequested >= session.dialogData.awardsBornCtryLen){
            nobels2show = session.dialogData.awardsBornCtryLen;
        }else{
            nobels2show = nobelsRequested;
        }
        
        if(cronSort){
            sortedNobels = session.dialogData.awardsBornCtry;    
        }else{
            sortedNobels = session.dialogData.awardsBornCtry.reverse();    
        }
                
        var nobelsOutput = formatNobelOutput(nobels2show, sortedNobels);
                
        session.endDialog(nobelsOutput);
        
        
    }
]);

bot.dialog('/getHelp',[
    function (session){
        builder.Prompts.choice(session,"Type your choice number for help:","Look for Laureate|Awards by country|Take me back");
    },

    function(session, results){
        var helpOutput = "";
        switch(results.response.index){
            case 0:
                helpOutput = "You can ask me about a laureate providing the prize year and category, for example:  \n\
                              => who won the nobel literature prize in 1990?  \n\
                              => nobel medicine 1980  \n\
                              and other sentences you'd use to query someone about the topic.  \n";
                session.endDialog(helpOutput);
                session.beginDialog("/getHelp");
                
                break;
            case 1:
                helpOutput = "You can ask me about the prizes awarded to laureates from a certain country, for example:  \n\
                              => nobels won by someone from Spain.  \n\
                              => nobels from Canada.  \n\
                              => which prizes where awarded to someone from India.  \n\
                              Note that country names can be replaced by their two character ISO codes (ES for Spain, US for USA...)."
                session.endDialog(helpOutput);
                session.beginDialog("/getHelp");
                break;
            case 2:
                session.endDialog();
                
                break;   
            default:
                break;
        }
    }
]);


function getURLsurname(surname){
    var translate = /[äëïöüåø]/g;
    surname = surname.toLowerCase();
    surname =  surname.replace(translate, function(match){
        return DICTIONARY[match];
    })
    surnameParts = surname.split(" ");
    surnamePartsLength = surnameParts.length;  
    if(surnamePartsLength > 2){
        return surnameParts[surnamePartsLength-1];
    }else if(surnamePartsLength == 2){
        if(surnameParts[1] === "jr."){
            return surnameParts[0];
        }
        if(surnameParts[0] === "von"){
            return surnameParts[1];
        }else{
            return  surnameParts[0] + "_" + surnameParts[1];  
        }
    }
    
    return surname;
}

function getJSONresult(url, session, entityType, next) {
    
    request({
        url: url,
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            if (entityType === LAUREATES) {
                if(body.prizes.length > 0){
                    var JSONlaureates = body.prizes[0].laureates;
                    var JSONlaureatesLen = JSONlaureates.length;
                    
                    var firstname, surname, motivation,name = '';
                    var laureate = '';                
                    var card = null;
                    for (i = 0; i < JSONlaureatesLen; i++) {
                            if (i > 0) {
                                laureate += ' and ';
                            }
                            if (JSONlaureates[i].firstname) {
                                firstname = JSONlaureates[i].firstname;
                                
                                laureate += firstname + " ";
                                
                            }else{
                                firstname = '';
                            }
                            if (JSONlaureates[i].surname) {
                                surname = JSONlaureates[i].surname;
                                laureate += surname + " ";                        
                                
                            }else{
                                surname = '';
                            }
                            //if (i == JSONlaureatesLen - 1) {
                            if (JSONlaureates[i].motivation) {
                                motivation = JSONlaureates[i].motivation;
                                laureate += motivation + " "; 
                            }else{
                                motivation = '';
                            }

                            name = firstname + " " + surname;
                            var URLsurname = getURLsurname(surname);
                            var url = "http://www.nobelprize.org/nobel_prizes/" + session.dialogData.category + "/laureates/" + session.dialogData.year + "/" + URLsurname + "_postcard.jpg";
                            
                            console.log(url);
                            requestp(url, session, name, motivation, URLsurname).then(function (data) {
                                //console.log("%s@%s: %s", data.name, data.version, data.description);
                                session.send(new builder.Message(session).addAttachment(data));
                            }, function (err) {
                                session.send(new builder.Message(session).addAttachment(err));
                            });                            
                        }
                        session.endDialog("");
                }else{
                    session.endDialog("No prizes have been found for " + session.dialogData.category + " category in " + session.dialogData.year);
                }
            } else {
                if (entityType === COUNTRYAWARDS) {
                    var JSONCountryAwards = body.laureates;
                    var JSONCountryAwardsLen = JSONCountryAwards.length;
                    var bornCountry = session.dialogData.bornCountry;
                    if (JSONCountryAwardsLen > 5) {
                        session.send(bornCountry + " has " + JSONCountryAwardsLen + " people who have been awarded with Nobel Prize");
                        session.dialogData.awardsBornCtryLen = JSONCountryAwardsLen;
                        session.dialogData.awardsBornCtry = JSONCountryAwards;
                        next();
                    }else if (JSONCountryAwardsLen > 0 ){
                        var nobelsOutput = formatNobelOutput(JSONCountryAwardsLen, JSONCountryAwards);
                        session.endDialog(nobelsOutput);
                    }else{
                        var errMsg = "No nobels from " + bornCountry.toUpperCase() + " have been found.";
                        if(bornCountry.length > 2){
                            errMsg += "  \nYou can reformulate the query using two character country ISO Code:"
                            errMsg += "  \nhttps://en.wikipedia.org/wiki/ISO_3166-1_alpha-2#Officially_assigned_code_elements  \n";
                        }
                        session.endDialog(errMsg);
                    }
                }
            }
            


        }else{
            session.endDialog("The nobel prize database is not available, please try again later");
        }
    });
};

function requestp(url, session, title, motivation, URLsurname) {
    var year = session.dialogData.year;
    var category = session.dialogData.category;
    
    return new Promise(function (resolve, reject) {    
        request({url:url}, function (err, res, body) {                        
            if (err) {
                return reject(err);
            } else if (res.statusCode !== 200) {
    
                card = new builder.ThumbnailCard(session)
                                            .title(title.toUpperCase())
                                            .subtitle(year + " " + category)
                                            .text(motivation)
                                            .images([builder.CardImage.create(session, "http://vignette4.wikia.nocookie.net/inciclopedia/images/5/51/Alfred-nobel_1.jpg/revision/latest?cb=20160122171537")])
                                            .buttons([builder.CardAction.openUrl(session, "http://www.nobelprize.org/nobel_prizes/" + category + "/laureates/" + year, 'Go to Facts')]);
                return reject(card);
            }
            card = new builder.ThumbnailCard(session)
                                            .title(title.toUpperCase())
                                            .subtitle(year + " " + category)
                                            .text(motivation)
                                            .images([builder.CardImage.create(session, url)])
                                            .buttons([builder.CardAction.openUrl(session, "http://www.nobelprize.org/nobel_prizes/" + category + "/laureates/" + year + "/" + URLsurname + "-facts.html", 'Go To Facts')]);
            resolve(card);
        });
    });
}

function formatNobelOutput(nobels2show, sortedNobels){
    var nobelsOutput = "";
    for(i=0;i<nobels2show;i++){
                nobelPrizes = sortedNobels[i].prizes; 
                for(j=0;j<nobelPrizes.length;j++){
                    if(nobelPrizes[j].motivation){
                        nobelsOutput += "YEAR: " + nobelPrizes[j].year +  
                                        "   CATEGORY: " + nobelPrizes[j].category +  
                                        "   MOTIVATION: " + nobelPrizes[j].motivation + "  \n";    
                    }else{
                        nobelsOutput += "YEAR: " + nobelPrizes[j].year +  
                                        "   CATEGORY: " + nobelPrizes[j].category + "  \n";                                        
                    }
                       
                }            
    }
    
    return nobelsOutput;
}
     

//Puesta en marcha del servicio REST
var server = restify.createServer();
server.post('/api/messages', connector.listen());
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});