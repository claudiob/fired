/*** SERVER ***/

var http    = require('http'),
    fs      = require('fs');

exports.start_server = function(port, static_page) {
    // Start and return a server listening to PORT and showing STATIC_PAGE
    server = http.createServer(function(req, res){
        res.writeHead(200, {'Content-Type': 'text/html'});
        var output = fs.readFileSync('./index.html', 'utf8');
        res.end(output);
    });
    server.listen(8080);
    return server;
}


/*** ARRAY ***/

Array.prototype.diff = function(a) {
    // Return the set-difference of two arrays
    return this.filter(function(i) {return !(a.indexOf(i) > -1);});
}
